use std::convert::Into;
use std::convert::TryInto;
use std::fmt::Debug;

use anchor_lang::prelude::*;
use anchor_lang::solana_program::{clock, sysvar};
use anchor_spl::token::{self, Mint, Token, TokenAccount};

use crate::calculator::*;
mod calculator;

declare_id!("6RwUKAHuSbadG6sQzcfEYKh6UGvPvCXB1nq7BPEyn5Jg");

const MIN_DURATION: u64 = 1;
const MERCHANT_PDA_SEED: &[u8] = b"merchant-pool";
const STAKING_VAULT_PDA_SEED: &[u8] = b"staking-vault";
const REWARD_VAULT_PDA_SEED: &[u8] = b"reward-vault";
// const LOCKING_PERIOD_OF_STAKING_ON_BEHALF: i64 = 2 * 365 * 86400;
const LOCKING_PERIOD_OF_STAKING_ON_BEHALF: i64 = 1;

const PRECISION: u128 = u64::MAX as u128;
const REWARD_RATE: u64 = 10_000_000;


/// Update the pool with the total reward per token
pub fn update_rewards(
    pool: &mut Box<Account<Pool>>,
    user: Option<&mut Box<Account<User>>>,
    merchant: Option<&mut Box<Account<Merchant>>>,
    total_staked: u64,
) -> Result<()> {
    let last_time_reward_applicable = clock::Clock::get().unwrap().unix_timestamp.try_into().unwrap();

    let calc = get_calculator();
    let reward =
        calc.reward_per_token(pool, total_staked, last_time_reward_applicable);

    pool.reward_per_token_stored = reward;
    pool.last_update_time = last_time_reward_applicable;

    if let Some(u) = user {
        let user_reward = calc.user_earned_amount(pool, u);

        u.reward_per_token_pending = user_reward;
        u.reward_per_token_complete = pool.reward_per_token_stored;
    }

    if let Some(m) = merchant {
        let merchant_reward = calc.merchant_earned_amount(pool, m);

        m.reward_per_token_pending = merchant_reward;
        m.reward_per_token_complete = pool.reward_per_token_stored;
    }

    Ok(())
}

#[program]
pub mod staking_contract {
    use super::*;

    pub fn initialize_main_pool(
        ctx: Context<InitializeMainPool>,
        pool_nonce: u8,
        reward_duration: u64,
    ) -> ProgramResult {
        if reward_duration < MIN_DURATION {
            return Err(ErrorCode::DurationTooShort.into());
        }

        let pool = &mut ctx.accounts.pool;

        pool.authority = ctx.accounts.authority.key();
        pool.nonce = pool_nonce;
        pool.paused = false;
        pool.staking_mint = ctx.accounts.staking_mint.key();
        pool.staking_vault = ctx.accounts.staking_vault.key();
        pool.reward_mint = ctx.accounts.reward_mint.key();
        pool.reward_vault = ctx.accounts.reward_vault.key();
        pool.reward_duration = reward_duration;
        pool.reward_duration_end = 0;
        pool.last_update_time = 0;

        pool.reward_rate = 0;
        pool.reward_per_token_stored = 0;

        pool.user_stake_count = 0;
        pool.merchant_count = 0;

        Ok(())
    }

    /// Initialize a user staking account
    pub fn create_user(ctx: Context<CreateUser>, nonce: u8, current_ts: i64) -> Result<()> {
        let user = &mut ctx.accounts.user;
        user.pool = *ctx.accounts.pool.to_account_info().key;
        user.owner = *ctx.accounts.owner.key;

        user.reward_per_token_complete = 0;
        user.reward_per_token_pending = 0;

        user.balance_staked = 0;
        user.balance_self_staked = 0;
        user.registerd_at = current_ts;
        user.staked_count = 0;
        user.claimed_count = 0;
        user.nonce = nonce;

        let pool = &mut ctx.accounts.pool;
        pool.user_stake_count = pool.user_stake_count.checked_add(1).unwrap();
        pool.user_stake_list.push(*ctx.accounts.user.to_account_info().key);

        Ok(())
    }

    /// Pauses the pool
    pub fn pause(ctx: Context<Pause>) -> Result<()> {
        let pool = &mut ctx.accounts.pool;
        pool.paused = true;

        Ok(())
    }

    /// Unpauses a previously paused pool and allowing for funding
    pub fn unpause(ctx: Context<Unpause>) -> Result<()> {
        let pool = &mut ctx.accounts.pool;
        pool.paused = false;

        Ok(())
    }

    /// A user stakes tokens in the main pool.
    pub fn stake(
        ctx: Context<Stake>,
        amount: u64,
        current_ts: i64,
        locking_period: i64,
    ) -> Result<()> {
        if amount == 0 {
            return Err(ErrorCode::AmountMustBeGreaterThanZero.into());
        }

        let pool = &mut ctx.accounts.pool;

        if pool.paused {
            return Err(ErrorCode::PoolPaused.into());
        }

        let total_staked = ctx.accounts.staking_vault.amount;
        let user_opt = Some(&mut ctx.accounts.user);
        update_rewards(pool, user_opt, None, total_staked).unwrap();

        if ctx.accounts.user.staked_count == 0 {
            ctx.accounts.user.claimed_ts = current_ts;
            ctx.accounts.user.first_staked_ts = current_ts;
            ctx.accounts.user.end_ts = current_ts + locking_period;
        } else {
            if ctx.accounts.user.end_ts - current_ts > 0 {
                ctx.accounts.user.end_ts = ctx
                    .accounts
                    .user
                    .end_ts
                    .checked_add(locking_period)
                    .unwrap();
            } else {
                ctx.accounts.user.end_ts = current_ts + locking_period;
            }
        }

        if ctx.accounts.user.balance_staked == 0 {
            ctx.accounts.user.claimed_ts = current_ts;
        }

        ctx.accounts.user.balance_staked = ctx
            .accounts
            .user
            .balance_staked
            .checked_add(amount)
            .unwrap();
        ctx.accounts.user.balance_self_staked = ctx
            .accounts
            .user
            .balance_self_staked
            .checked_add(amount)
            .unwrap();
        ctx.accounts.user.staked_ts = current_ts;
        ctx.accounts.user.staked_count = ctx
            .accounts
            .user
            .staked_count
            .checked_add(1)
            .unwrap();
            
        // Transfer tokens into the stake vault.
        {
            let cpi_ctx = CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                token::Transfer {
                    from: ctx.accounts.stake_from_account.to_account_info(),
                    to: ctx.accounts.staking_vault.to_account_info(),
                    authority: ctx.accounts.owner.to_account_info(), //todo use user account as signer
                },
            );
            token::transfer(cpi_ctx, amount)?;
        }

        Ok(())
    }

    /// A user unstakes tokens in the pool.
    pub fn unstake(ctx: Context<Stake>, spt_amount: u64, current_ts: i64) -> Result<()> {
        if spt_amount == 0 {
            return Err(ErrorCode::AmountMustBeGreaterThanZero.into());
        }

        if ctx.accounts.user.end_ts > current_ts {
            return Err(ErrorCode::UnstakingNotOver.into());
        }

        let pool = &mut ctx.accounts.pool;

        if ctx.accounts.user.balance_self_staked < spt_amount {
            return Err(ErrorCode::InsufficientFundUnstake.into());
        }

        let total_staked = ctx.accounts.staking_vault.amount;
        let user_opt = Some(&mut ctx.accounts.user);
        update_rewards(pool, user_opt, None, total_staked).unwrap();

        // Transfer tokens from the pool vault to user vault.
        {
            let seeds = &[pool.to_account_info().key.as_ref(), &[pool.nonce]];
            let pool_signer = &[&seeds[..]];

            let cpi_ctx = CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                token::Transfer {
                    from: ctx.accounts.staking_vault.to_account_info(),
                    to: ctx.accounts.stake_from_account.to_account_info(),
                    authority: ctx.accounts.pool_signer.to_account_info(),
                },
                pool_signer,
            );
            token::transfer(cpi_ctx, spt_amount)?;
        }

        ctx.accounts.user.balance_staked = ctx
            .accounts
            .user
            .balance_staked
            .checked_sub(spt_amount)
            .unwrap();

        ctx.accounts.user.balance_self_staked = ctx
            .accounts
            .user
            .balance_self_staked
            .checked_sub(spt_amount)
            .unwrap();

        Ok(())
    }

    /// Fund the pool with rewards
    pub fn fund(ctx: Context<Fund>, amount: u64) -> Result<()> {
        // Transfer reward A tokens into the A vault.
        if amount > 0 {
            let cpi_ctx = CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                token::Transfer {
                    from: ctx.accounts.from.to_account_info(),
                    to: ctx.accounts.reward_vault.to_account_info(),
                    authority: ctx.accounts.funder.to_account_info(),
                },
            );

            token::transfer(cpi_ctx, amount)?;
        }

        Ok(())
    }

    /// A user claiming rewards
    pub fn claim(ctx: Context<ClaimReward>, current_ts: i64) -> Result<()> {
        let total_staked = ctx.accounts.staking_vault.amount;

        let pool = &mut ctx.accounts.pool;
        let user_opt = Some(&mut ctx.accounts.user);
        update_rewards(pool, user_opt, None, total_staked).unwrap();

        let seeds = &[
            ctx.accounts.pool.to_account_info().key.as_ref(),
            &[ctx.accounts.pool.nonce],
        ];
        let pool_signer = &[&seeds[..]];

        if ctx.accounts.user.reward_per_token_pending > 0 {
            let mut reward_amount = ctx.accounts.user.reward_per_token_pending;
            let vault_balance = ctx.accounts.reward_vault.amount;

            if vault_balance < reward_amount {
                ctx.accounts.user.reward_per_token_pending = reward_amount - vault_balance;
                reward_amount = vault_balance;
            } else {
                ctx.accounts.user.reward_per_token_pending = 0;
            }

            if reward_amount > 0 {
                let cpi_ctx = CpiContext::new_with_signer(
                    ctx.accounts.token_program.to_account_info(),
                    token::Transfer {
                        from: ctx.accounts.reward_vault.to_account_info(),
                        to: ctx.accounts.reward_account.to_account_info(),
                        authority: ctx.accounts.pool_signer.to_account_info(),
                    },
                    pool_signer,
                );
                token::transfer(cpi_ctx, reward_amount)?;

                ctx.accounts.user.claimed_ts = current_ts;
                ctx.accounts.user.claimed_count = ctx
                    .accounts
                    .user
                    .claimed_count
                    .checked_add(1)
                    .unwrap();
            }
        }

        Ok(())
    }

    /// Closes a users stake account. Validation is done to ensure this is only allowed when
    /// the user has nothing staked and no rewards pending.
    pub fn close_user(ctx: Context<CloseUser>) -> Result<()> {
        let pool = &mut ctx.accounts.pool;
        pool.user_stake_count = pool.user_stake_count.checked_sub(1).unwrap();
        Ok(())
    }

    /// Closes a pool account. Only able to be done when there are no users staked.
    pub fn close_pool(ctx: Context<ClosePool>) -> Result<()> {
        let pool = &ctx.accounts.pool;

        let signer_seeds = &[
            pool.to_account_info().key.as_ref(),
            &[ctx.accounts.pool.nonce],
        ];

        //close staking vault
        let ix = spl_token::instruction::transfer(
            &spl_token::ID,
            ctx.accounts.staking_vault.to_account_info().key,
            ctx.accounts.staking_refundee.to_account_info().key,
            ctx.accounts.pool_signer.key,
            &[ctx.accounts.pool_signer.key],
            ctx.accounts.staking_vault.amount,
        )?;
        solana_program::program::invoke_signed(
            &ix,
            &[
                ctx.accounts.token_program.to_account_info(),
                ctx.accounts.staking_vault.to_account_info(),
                ctx.accounts.staking_refundee.to_account_info(),
                ctx.accounts.pool_signer.to_account_info(),
            ],
            &[signer_seeds],
        )?;
        let ix = spl_token::instruction::close_account(
            &spl_token::ID,
            ctx.accounts.staking_vault.to_account_info().key,
            ctx.accounts.refundee.key,
            ctx.accounts.pool_signer.key,
            &[ctx.accounts.pool_signer.key],
        )?;
        solana_program::program::invoke_signed(
            &ix,
            &[
                ctx.accounts.token_program.to_account_info(),
                ctx.accounts.staking_vault.to_account_info(),
                ctx.accounts.refundee.to_account_info(),
                ctx.accounts.pool_signer.to_account_info(),
            ],
            &[signer_seeds],
        )?;

        Ok(())
    }

    ///////////////////////////////////////////////
    /// Start Merchant Pool
    ///////////////////////////////////////////////

    /// Initialize a merchant pool
    pub fn initialize_merchant_pool(
        ctx: Context<InitializeMerchantPool>,
        merchant_name: String,
        merchant_nonce: u8,
        current_ts: i64
    ) -> ProgramResult {
        let merchant = &mut ctx.accounts.merchant;
        merchant.pool = *ctx.accounts.pool.to_account_info().key;
        merchant.owner = *ctx.accounts.owner.key;
        merchant.self_balance_staked = 0;

        merchant.reward_per_token_complete = 0;
        merchant.reward_per_token_pending = 0;
        
        merchant.balance_staked = 0;
        merchant.merchant_user_stake_count = 0;
        merchant.merchant_name = merchant_name;
        merchant.nonce = merchant_nonce;
        merchant.created_at = current_ts;
        merchant.paused = false;

        let pool = &mut ctx.accounts.pool;
        pool.merchant_count = pool.merchant_count.checked_add(1).unwrap();
        pool.merchant_stake_list.push(*ctx.accounts.merchant.to_account_info().key);

        Ok(())
    }

    /// Initialize a merchant user staking account
    pub fn create_merchant_user(ctx: Context<CreateMerchantUser>, nonce: u8, current_ts: i64) -> Result<()> {
        let merchant_user = &mut ctx.accounts.merchant_user;
        merchant_user.pool = *ctx.accounts.pool.to_account_info().key;
        merchant_user.merchant = *ctx.accounts.merchant.to_account_info().key;
        merchant_user.owner = *ctx.accounts.owner.key;
        merchant_user.balance_staked = 0;
        merchant_user.registerd_at = current_ts;
        merchant_user.staked_count = 0;
        merchant_user.claimed_count = 0;
        merchant_user.nonce = nonce;

        let merchant = &mut ctx.accounts.merchant;
        merchant.merchant_user_stake_count = merchant.merchant_user_stake_count.checked_add(1).unwrap();
        merchant.merchant_user_stake_list.push(*ctx.accounts.merchant_user.to_account_info().key);

        Ok(())
    }

    /// A user stakes tokens in the merchant pool.
    pub fn stake_token_to_merchant(
        ctx: Context<StakeTokenToMerchant>, 
        amount: u64, 
        current_ts: i64, 
        locking_period: i64
    ) -> Result<()> {
        if amount == 0 {
            return Err(ErrorCode::AmountMustBeGreaterThanZero.into());
        }

        let pool = &mut ctx.accounts.pool;

        let total_staked = ctx.accounts.staking_vault.amount;
        let merchant_opt = Some(&mut ctx.accounts.merchant);
        update_rewards(pool, None, merchant_opt, total_staked).unwrap();

        if pool.paused {
            return Err(ErrorCode::PoolPaused.into());
        }

        if ctx.accounts.merchant.paused {
            return Err(ErrorCode::MerchantPaused.into());
        }

        if ctx.accounts.merchant.merchant_user_stake_count == 1 {
            ctx.accounts.merchant.last_updated_ts = current_ts;
        }

        if ctx.accounts.merchant.balance_staked == 0 {
            ctx.accounts.merchant.last_updated_ts = current_ts;
        }

        if ctx.accounts.merchant_user.staked_count == 0 {
            ctx.accounts.merchant_user.claimed_ts = current_ts;
            ctx.accounts.merchant_user.first_staked_ts = current_ts;
            ctx.accounts.merchant_user.end_ts = current_ts + locking_period;
        } else {
            if ctx.accounts.merchant_user.end_ts - current_ts > 0 {
                ctx.accounts.merchant_user.end_ts = ctx
                    .accounts
                    .merchant_user
                    .end_ts
                    .checked_add(locking_period)
                    .unwrap();
            } else {
                ctx.accounts.merchant_user.end_ts = current_ts + locking_period;
            }
        }

        if ctx.accounts.merchant_user.balance_staked == 0 {
            ctx.accounts.merchant_user.claimed_ts = current_ts;
        }

        ctx.accounts.merchant.balance_staked = ctx
            .accounts
            .merchant
            .balance_staked
            .checked_add(amount)
            .unwrap();

        ctx.accounts.merchant_user.balance_staked = ctx
            .accounts
            .merchant_user
            .balance_staked
            .checked_add(amount)
            .unwrap();
        ctx.accounts.merchant_user.staked_ts = current_ts;
        ctx.accounts.merchant_user.staked_count = ctx
            .accounts
            .merchant_user
            .staked_count
            .checked_add(1)
            .unwrap();

        // Transfer tokens into the stake vault.
        {
            let cpi_ctx = CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                token::Transfer {
                    from: ctx.accounts.stake_from_account.to_account_info(),
                    to: ctx.accounts.staking_vault.to_account_info(),
                    authority: ctx.accounts.owner.to_account_info(), //todo use user account as signer
                },
            );
            token::transfer(cpi_ctx, amount)?;
        }

        Ok(())
    }

    /// A user unstakes tokens in the merchant pool.
    pub fn unstake_token_to_merchant(ctx: Context<StakeTokenToMerchant>, amount: u64, current_ts: i64) -> Result<()> {
        if amount == 0 {
            return Err(ErrorCode::AmountMustBeGreaterThanZero.into());
        }

        if ctx.accounts.merchant_user.end_ts > current_ts {
            return Err(ErrorCode::UnstakingNotOver.into());
        }

        let pool = &mut ctx.accounts.pool;

        if pool.paused {
            return Err(ErrorCode::PoolPaused.into());
        }

        if ctx.accounts.merchant_user.balance_staked < amount {
            return Err(ErrorCode::InsufficientFundUnstake.into());
        }

        let total_staked = ctx.accounts.staking_vault.amount;
        let merchant_opt = Some(&mut ctx.accounts.merchant);
        update_rewards(pool, None, merchant_opt, total_staked).unwrap();

        // Transfer tokens from the pool vault to user vault.
        {
            let seeds = &[pool.to_account_info().key.as_ref(), &[pool.nonce]];
            let pool_signer = &[&seeds[..]];

            let cpi_ctx = CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                token::Transfer {
                    from: ctx.accounts.staking_vault.to_account_info(),
                    to: ctx.accounts.stake_from_account.to_account_info(),
                    authority: ctx.accounts.pool_signer.to_account_info(),
                },
                pool_signer,
            );
            token::transfer(cpi_ctx, amount)?;
        }

        ctx.accounts.merchant_user.balance_staked = ctx
            .accounts
            .merchant_user
            .balance_staked
            .checked_sub(amount)
            .unwrap();

        ctx.accounts.merchant.balance_staked = ctx
            .accounts
            .merchant
            .balance_staked
            .checked_sub(amount)
            .unwrap();

        Ok(())
    }

    /// Pauses the merchant
    pub fn pause_merchant(ctx: Context<PauseMerchant>) -> Result<()> {
        let merchant = &mut ctx.accounts.merchant;
        merchant.paused = true;

        Ok(())
    }

    /// Unpauses a previously paused merchant
    /// allowing for funding
    pub fn unpause_merchant(ctx: Context<UnpauseMerchant>) -> Result<()> {
        let merchant = &mut ctx.accounts.merchant;
        merchant.paused = false;

        Ok(())
    }

    /// claim merchant reward for whole pool
    pub fn claim_reward_for_merchant(ctx: Context<ClaimRewardForMerchant>, current_ts: i64) -> Result<()> {
        let total_staked = ctx.accounts.staking_vault.amount;

        let pool = &mut ctx.accounts.pool;

        if pool.paused {
            return Err(ErrorCode::PoolPaused.into());
        }
        
        let merchant_opt = Some(&mut ctx.accounts.merchant);
        update_rewards(pool, None, merchant_opt, total_staked).unwrap();

        let seeds = &[
            ctx.accounts.pool.to_account_info().key.as_ref(),
            &[ctx.accounts.pool.nonce],
        ];
        let pool_signer = &[&seeds[..]];

        if ctx.accounts.merchant.reward_per_token_pending > 0 {
            let mut reward_amount = ctx.accounts.merchant.reward_per_token_pending;
            let vault_balance = ctx.accounts.reward_vault.amount;

            if vault_balance < reward_amount {
                reward_amount = vault_balance;

                ctx.accounts.merchant.reward_per_token_pending = reward_amount - vault_balance;
            } else {
                ctx.accounts.merchant.reward_per_token_pending = 0;
            }

            if reward_amount > 0 {
                let cpi_ctx = CpiContext::new_with_signer(
                    ctx.accounts.token_program.to_account_info(),
                    token::Transfer {
                        from: ctx.accounts.reward_vault.to_account_info(),
                        to: ctx.accounts.reward_account.to_account_info(),
                        authority: ctx.accounts.pool_signer.to_account_info(),
                    },
                    pool_signer,
                );
                token::transfer(cpi_ctx, reward_amount)?;

                ctx.accounts.merchant.last_updated_ts = current_ts;
            }
        }

        Ok(())
    }

    //////////////////////////////////////
    /// Stake on Behalf
    //////////////////////////////////////
    
    /// Admin stakes tokens behalf of users/merchants in the main pool
    pub fn stake_on_behalf(
        ctx: Context<StakeOnBehalf>,
        amount: u64,
        current_ts: i64
    ) -> Result<()> {
        if amount == 0 {
            return Err(ErrorCode::AmountMustBeGreaterThanZero.into());
        }

        let pool = &mut ctx.accounts.pool;

        if pool.paused {
            return Err(ErrorCode::PoolPaused.into());
        }

        let total_staked = ctx.accounts.staking_vault.amount;
        let user_opt = Some(&mut ctx.accounts.user);
        update_rewards(pool, user_opt, None, total_staked).unwrap();

        if ctx.accounts.user.staked_count == 0 {
            ctx.accounts.user.claimed_ts = current_ts;
            ctx.accounts.user.first_staked_ts = current_ts;
        }

        if ctx.accounts.user.balance_staked == 0 {
            ctx.accounts.user.claimed_ts = current_ts;
        }

        let user = &mut ctx.accounts.user;
        user.behalf_staked_ts.push(current_ts);
        user.behalf_staked_amount.push(amount);
        user.behalf_claimed_status.push(false);

        user.balance_staked = user
            .balance_staked
            .checked_add(amount)
            .unwrap();
        user.staked_ts = current_ts;
        user.staked_count = user
            .staked_count
            .checked_add(1)
            .unwrap();

        if !pool.passive_stakers_list.contains(&ctx.accounts.user.to_account_info().key) {
            pool.passive_stakers_list.push(*ctx.accounts.user.to_account_info().key);
        }
            
        // Transfer tokens into the stake vault.
        {
            let cpi_ctx = CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                token::Transfer {
                    from: ctx.accounts.stake_from_account.to_account_info(),
                    to: ctx.accounts.staking_vault.to_account_info(),
                    authority: ctx.accounts.owner.to_account_info(), //todo use user account as signer
                },
            );
            token::transfer(cpi_ctx, amount)?;
        }

        Ok(())
    }

    /// A user/merchant withdraws tokens staked by admin in the pool.
    pub fn withdraw(ctx: Context<Withdraw>, list_index: u32, current_ts: i64) -> Result<()> {
        if ctx.accounts.user.behalf_claimed_status[list_index as usize] {
            return Err(ErrorCode::AlreadyWithdrawn.into());
        }

        if ctx.accounts.user.behalf_staked_amount[list_index as usize] <= 0 {
            return Err(ErrorCode::NoTokensToWithdraw.into());
        }

        if ctx.accounts.user.behalf_staked_ts[list_index as usize] + LOCKING_PERIOD_OF_STAKING_ON_BEHALF > current_ts {
            return Err(ErrorCode::NotTimeToWithdrawTokens.into());
        }

        let amount_to_transfer = ctx.accounts.user.behalf_staked_amount[list_index as usize];

        let pool = &mut ctx.accounts.pool;
        
        if pool.paused {
            return Err(ErrorCode::PoolPaused.into());
        }

        let total_staked = ctx.accounts.staking_vault.amount;
        let user_opt = Some(&mut ctx.accounts.user);
        update_rewards(pool, user_opt, None, total_staked).unwrap();

        // Transfer tokens from the pool vault to user vault.
        {
            let seeds = &[pool.to_account_info().key.as_ref(), &[pool.nonce]];
            let pool_signer = &[&seeds[..]];

            let cpi_ctx = CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                token::Transfer {
                    from: ctx.accounts.staking_vault.to_account_info(),
                    to: ctx.accounts.stake_from_account.to_account_info(),
                    authority: ctx.accounts.pool_signer.to_account_info(),
                },
                pool_signer,
            );
            token::transfer(cpi_ctx, amount_to_transfer)?;
        }

        let user = &mut ctx.accounts.user;
        user.behalf_claimed_status[list_index as usize] = true;
        user.balance_staked = user
            .balance_staked
            .checked_sub(amount_to_transfer)
            .unwrap();

        Ok(())
    }
}

#[derive(Accounts)]
#[instruction(pool_nonce: u8)]
pub struct InitializeMainPool<'info> {
    /// CHECK: This is not dangerous because we don't read or write from this account
    authority: Signer<'info>,

    staking_mint: Box<Account<'info, Mint>>,

    #[account(
        init,
        seeds = [STAKING_VAULT_PDA_SEED, &pool_token_ata.to_account_info().key.to_bytes()], bump,
        payer = authority,
        token::mint = staking_mint,
        token::authority = pool_signer,
    )]
    staking_vault: Box<Account<'info, TokenAccount>>,

    reward_mint: Box<Account<'info, Mint>>,

    #[account(
        init,
        seeds = [REWARD_VAULT_PDA_SEED, &pool_token_ata.to_account_info().key.to_bytes()], bump,
        payer = authority,
        token::mint = reward_mint,
        token::authority = pool_signer,
    )]
    reward_vault: Box<Account<'info, TokenAccount>>,

    #[account(mut)]
    pub pool_token_ata: Account<'info, TokenAccount>,

    #[account(
        seeds = [
            pool.to_account_info().key.as_ref()
        ],
        bump = pool_nonce,
    )]
    /// CHECK: This is not dangerous because we don't read or write from this account
    pool_signer: UncheckedAccount<'info>,

    #[account(
        init,
        payer = authority,
        space = 10240
    )]
    pool: Box<Account<'info, Pool>>,

    token_program: Program<'info, Token>,
    rent: Sysvar<'info, Rent>,
    system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(nonce: u8)]
pub struct CreateUser<'info> {
    // Stake instance.
    #[account(
        mut,
        constraint = !pool.paused,
    )]
    pool: Box<Account<'info, Pool>>,
    // Member.
    #[account(
        init,
        payer = payer,
        seeds = [
            owner.key.as_ref(),
            pool.to_account_info().key.as_ref()
        ],
        bump = nonce,
        space = 10240
    )]
    user: Box<Account<'info, User>>,
    owner: AccountInfo<'info>,
    payer: Signer<'info>,
    // Misc.
    system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Pause<'info> {
    #[account(
        mut,
        has_one = authority,
        constraint = !pool.paused,
        constraint = pool.reward_duration_end < clock::Clock::get().unwrap().unix_timestamp.try_into().unwrap(),
        //constraint = pool.reward_duration_end > 0,
    )]
    pool: Box<Account<'info, Pool>>,
    authority: Signer<'info>,

    #[account(
        seeds = [
            pool.to_account_info().key.as_ref()
        ],
        bump = pool.nonce,
    )]
    /// CHECK: This is not dangerous because we don't read or write from this account
    pool_signer: UncheckedAccount<'info>,
    token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct Unpause<'info> {
    #[account(
        mut,
        has_one = authority,
        constraint = pool.paused,
    )]
    pool: Box<Account<'info, Pool>>,
    authority: Signer<'info>,

    #[account(
        seeds = [
            pool.to_account_info().key.as_ref()
        ],
        bump = pool.nonce,
    )]
    /// CHECK: This is not dangerous because we don't read or write from this account
    pool_signer: UncheckedAccount<'info>,
    token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct Stake<'info> {
    // Global accounts for the staking instance.
    #[account(
        mut,
        has_one = staking_vault,
    )]
    pool: Box<Account<'info, Pool>>,
    #[account(
        mut,
        constraint = staking_vault.owner == *pool_signer.key,
    )]
    staking_vault: Box<Account<'info, TokenAccount>>,

    // User.
    #[account(
        mut,
        has_one = owner,
        has_one = pool,
        seeds = [
            owner.key.as_ref(),
            pool.to_account_info().key.as_ref()
        ],
        bump = user.nonce,
    )]
    user: Box<Account<'info, User>>,
    owner: Signer<'info>,
    #[account(mut)]
    stake_from_account: Box<Account<'info, TokenAccount>>,

    // Program signers.
    #[account(
        seeds = [
            pool.to_account_info().key.as_ref()
        ],
        bump = pool.nonce,
    )]
    /// CHECK: This is not dangerous because we don't read or write from this account
    pool_signer: UncheckedAccount<'info>,

    // Misc.
    token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct FunderChange<'info> {
    // Global accounts for the staking instance.
    #[account(
        mut,
        has_one = authority,
    )]
    pool: Box<Account<'info, Pool>>,
    authority: Signer<'info>,
}

#[derive(Accounts)]
pub struct Fund<'info> {
    // Global accounts for the staking instance.
    #[account(
        mut,
        has_one = staking_vault,
        has_one = reward_vault,
        constraint = !pool.paused,
    )]
    pool: Box<Account<'info, Pool>>,
    #[account(mut)]
    staking_vault: Box<Account<'info, TokenAccount>>,
    #[account(mut)]
    reward_vault: Box<Account<'info, TokenAccount>>,
    #[account(
        //require signed funder auth - otherwise constant micro fund could hold funds hostage
        // constraint = funder.key() == pool.authority || pool.funders.iter().any(|x| *x == funder.key()),
    )]
    funder: Signer<'info>,
    #[account(mut)]
    from: Box<Account<'info, TokenAccount>>,
    // Program signers.
    #[account(
        seeds = [
            pool.to_account_info().key.as_ref()
        ],
        bump = pool.nonce,
    )]
    /// CHECK: This is not dangerous because we don't read or write from this account
    pool_signer: UncheckedAccount<'info>,

    // Misc.
    token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct ClaimReward<'info> {
    // Global accounts for the staking instance.
    #[account(
        mut,
        has_one = staking_vault,
        has_one = reward_vault,
    )]
    pool: Box<Account<'info, Pool>>,
    #[account(mut)]
    staking_vault: Box<Account<'info, TokenAccount>>,
    #[account(mut)]
    reward_vault: Box<Account<'info, TokenAccount>>,

    // User.
    #[account(
        mut,
        has_one = owner,
        has_one = pool,
        seeds = [
            owner.to_account_info().key.as_ref(),
            pool.to_account_info().key.as_ref()
        ],
        bump = user.nonce,
    )]
    user: Box<Account<'info, User>>,
    owner: Signer<'info>,
    #[account(mut)]
    reward_account: Box<Account<'info, TokenAccount>>,

    // Program signers.
    #[account(
        seeds = [
            pool.to_account_info().key.as_ref()
        ],
        bump = pool.nonce,
    )]
    /// CHECK: This is not dangerous because we don't read or write from this account
    pool_signer: UncheckedAccount<'info>,

    // Misc.
    token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct CloseUser<'info> {
    #[account(mut)]
    pool: Box<Account<'info, Pool>>,
    #[account(
        mut,
        close = owner,
        // has_one = owner,
        has_one = pool,
        seeds = [
            owner.to_account_info().key.as_ref(),
            pool.to_account_info().key.as_ref()
        ],
        bump = user.nonce,
        constraint = user.balance_staked == 0,
    )]
    user: Account<'info, User>,
    owner: Signer<'info>,
}

#[derive(Accounts)]
pub struct ClosePool<'info> {
    #[account(mut)]
    /// CHECK: This is not dangerous because we don't read or write from this account
    refundee: UncheckedAccount<'info>,
    #[account(mut)]
    staking_refundee: Box<Account<'info, TokenAccount>>,

    #[account(
        mut,
        close = refundee,
        has_one = authority,
        has_one = staking_vault,
        has_one = reward_vault,
        constraint = pool.paused,
        constraint = pool.reward_duration_end < sysvar::clock::Clock::get().unwrap().unix_timestamp.try_into().unwrap(),
        constraint = pool.user_stake_count == 0,
    )]
    pool: Account<'info, Pool>,
    authority: Signer<'info>,
    #[account(mut,
        constraint = staking_vault.amount == 0,
    )]
    staking_vault: Box<Account<'info, TokenAccount>>,
    #[account(mut)]
    reward_vault: Box<Account<'info, TokenAccount>>,
    #[account(
        seeds = [
            pool.to_account_info().key.as_ref()
        ],
        bump = pool.nonce,
    )]
    /// CHECK: This is not dangerous because we don't read or write from this account
    pool_signer: UncheckedAccount<'info>,
    token_program: Program<'info, Token>,
}

/////////////////////////////////////////////////////////
/// Merchant 
/////////////////////////////////////////////////////////
#[derive(Accounts)]
#[instruction(merchant_nonce: u8)]
pub struct InitializeMerchantPool<'info> {
    #[account(
        mut,
        constraint = !pool.paused,
    )]
    pool: Box<Account<'info, Pool>>,
    // Member.
    #[account(
        init,
        payer = owner,
        seeds = [
            MERCHANT_PDA_SEED,
            owner.key.as_ref(),
            pool.to_account_info().key.as_ref(),
        ],
        bump,
        space = 8 * 256
    )]
    merchant: Box<Account<'info, Merchant>>,
    owner: Signer<'info>,
    system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(nonce: u8)]
pub struct CreateMerchantUser<'info> {
    // Stake instance.
    #[account(
        mut,
        constraint = !pool.paused,
    )]
    pool: Box<Account<'info, Pool>>,

    #[account(
        mut,
        has_one = pool,
        constraint = !merchant.paused,
    )]
    merchant: Box<Account<'info, Merchant>>,

    // Member.
    #[account(
        init,
        payer = owner,
        // has_one = pool,
        // has_one = merchant,
        seeds = [
            owner.key.as_ref(),
            merchant.to_account_info().key.as_ref(),
            pool.to_account_info().key.as_ref()
        ],
        bump = nonce,
    )]
    merchant_user: Box<Account<'info, MerchantUser>>,
    owner: Signer<'info>,
    // Misc.
    system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct StakeTokenToMerchant<'info> {
    #[account(
        mut,
        constraint = !pool.paused,
        has_one = staking_vault,
    )]
    pool: Box<Account<'info, Pool>>,
    #[account(
        mut,
        constraint = staking_vault.owner == *pool_signer.key,
    )]
    staking_vault: Box<Account<'info, TokenAccount>>,

    // merchant
    #[account(
        mut,
        constraint = !merchant.paused,
        has_one = pool,
    )]
    merchant: Box<Account<'info, Merchant>>,
    // merchant user
    #[account(
        mut,
        has_one = owner,
        has_one = pool,
        has_one = merchant,
        seeds = [
            owner.key.as_ref(),
            merchant.to_account_info().key.as_ref(),
            pool.to_account_info().key.as_ref()
        ],
        bump = merchant_user.nonce,
    )]
    merchant_user: Box<Account<'info, MerchantUser>>,
    owner: Signer<'info>,
    #[account(mut)]
    stake_from_account: Box<Account<'info, TokenAccount>>,

    // Program signers.
    #[account(
        seeds = [
            pool.to_account_info().key.as_ref()
        ],
        bump = pool.nonce,
    )]
    /// CHECK: This is not dangerous because we don't read or write from this account
    pool_signer: UncheckedAccount<'info>,

    // Misc.
    token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct PauseMerchant<'info> {
    #[account(
        mut,
        constraint = !pool.paused,
        constraint = pool.reward_duration_end < clock::Clock::get().unwrap().unix_timestamp.try_into().unwrap(),
    )]
    pool: Box<Account<'info, Pool>>,
    #[account(
        mut,
        has_one = pool,
        constraint = !pool.paused,
        constraint = !merchant.paused,
    )]
    merchant: Box<Account<'info, Merchant>>,
    owner: Signer<'info>,

    #[account(
        seeds = [
            pool.to_account_info().key.as_ref()
        ],
        bump = pool.nonce,
    )]
    /// CHECK: This is not dangerous because we don't read or write from this account
    pool_signer: UncheckedAccount<'info>,
    token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct UnpauseMerchant<'info> {
    #[account(
        mut,
        constraint = !pool.paused,
    )]
    pool: Box<Account<'info, Pool>>,
    #[account(
        mut,
        has_one = pool,
        constraint = !pool.paused,
        constraint = merchant.paused,
    )]
    merchant: Box<Account<'info, Merchant>>,
    owner: Signer<'info>,

    #[account(
        seeds = [
            pool.to_account_info().key.as_ref()
        ],
        bump = pool.nonce,
    )]
    /// CHECK: This is not dangerous because we don't read or write from this account
    pool_signer: UncheckedAccount<'info>,
    token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct ClaimRewardForMerchant<'info> {
    #[account(
        mut,
        has_one = staking_vault,
        has_one = reward_vault,
    )]
    pool: Box<Account<'info, Pool>>,
    #[account(
        mut,
        has_one = owner,
        has_one = pool,
    )]
    merchant: Box<Account<'info, Merchant>>,
    #[account(mut)]
    staking_vault: Box<Account<'info, TokenAccount>>,
    #[account(mut)]
    reward_vault: Box<Account<'info, TokenAccount>>,

    owner: Signer<'info>,
    #[account(mut)]
    reward_account: Box<Account<'info, TokenAccount>>,

    // Program signers.
    #[account(
        seeds = [
            pool.to_account_info().key.as_ref()
        ],
        bump = pool.nonce,
    )]
    /// CHECK: This is not dangerous because we don't read or write from this account
    pool_signer: UncheckedAccount<'info>,

    // Misc.
    token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct MerchantStake<'info> {
    // Global accounts for the staking instance.
    #[account(
        mut,
        has_one = staking_vault,
    )]
    pool: Box<Account<'info, Pool>>,
    #[account(
        mut,
        has_one = owner,
    )]
    merchant: Box<Account<'info, Merchant>>,
    #[account(
        mut,
        constraint = staking_vault.owner == *pool_signer.key,
    )]
    staking_vault: Box<Account<'info, TokenAccount>>,

    owner: Signer<'info>,
    #[account(mut)]
    stake_from_account: Box<Account<'info, TokenAccount>>,

    // Program signers.
    #[account(
        seeds = [
            pool.to_account_info().key.as_ref()
        ],
        bump = pool.nonce,
    )]
    /// CHECK: This is not dangerous because we don't read or write from this account
    pool_signer: UncheckedAccount<'info>,

    // Misc.
    token_program: Program<'info, Token>,
}

////////////////////////////////////////////////////
/// Stake on Behalf
////////////////////////////////////////////////////
#[derive(Accounts)]
pub struct StakeOnBehalf<'info> {
    // Global accounts for the staking instance.
    #[account(
        mut,
        has_one = staking_vault,
    )]
    pool: Box<Account<'info, Pool>>,

    #[account(
        mut,
        constraint = staking_vault.owner == *pool_signer.key,
    )]
    staking_vault: Box<Account<'info, TokenAccount>>,

    #[account(
        mut,
        has_one = pool
    )]
    user: Box<Account<'info, User>>,

    owner: Signer<'info>,
    #[account(mut)]
    stake_from_account: Box<Account<'info, TokenAccount>>,

    // Program signers.
    #[account(
        seeds = [
            pool.to_account_info().key.as_ref()
        ],
        bump = pool.nonce,
    )]
    /// CHECK: This is not dangerous because we don't read or write from this account
    pool_signer: UncheckedAccount<'info>,
    // Misc
    token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct Withdraw<'info> {
    // Global accounts for the staking instance.
    #[account(
        mut,
        has_one = staking_vault,
    )]
    pool: Box<Account<'info, Pool>>,
    #[account(
        mut,
        constraint = staking_vault.owner == *pool_signer.key,
    )]
    staking_vault: Box<Account<'info, TokenAccount>>,

    // User.
    #[account(
        mut,
        has_one = owner,
        has_one = pool,
        seeds = [
            owner.key.as_ref(),
            pool.to_account_info().key.as_ref()
        ],
        bump = user.nonce,
    )]
    user: Box<Account<'info, User>>,
    owner: Signer<'info>,
    #[account(mut)]
    stake_from_account: Box<Account<'info, TokenAccount>>,

    // Program signers.
    #[account(
        seeds = [
            pool.to_account_info().key.as_ref()
        ],
        bump = pool.nonce,
    )]
    /// CHECK: This is not dangerous because we don't read or write from this account
    pool_signer: UncheckedAccount<'info>,

    // Misc.
    token_program: Program<'info, Token>,
}

#[account]
pub struct Pool {
    /// Priviledged account.
    pub authority: Pubkey,
    /// Nonce to derive the program-derived address owning the vaults.
    pub nonce: u8,
    /// Paused state of the program
    pub paused: bool,
    /// Mint of the token that can be staked.
    pub staking_mint: Pubkey,
    /// Vault to store staked tokens.
    pub staking_vault: Pubkey,
    /// Mint of the reward A token.
    pub reward_mint: Pubkey,
    /// Vault to store reward A tokens.
    pub reward_vault: Pubkey,
    /// The period which rewards are linearly distributed.
    pub reward_duration: u64,
    /// The timestamp at which the current reward period ends.
    pub reward_duration_end: u64,
    /// The last time reward states were updated.
    pub last_update_time: u64,
    /// Rate of reward distribution.
    pub reward_rate: u64,
    /// Last calculated reward per pool token.
    pub reward_per_token_stored: u128,
    /// Users staked
    pub user_stake_count: u32,
    /// Merchant count
    pub merchant_count: u32,
    /// List of the users staked
    pub user_stake_list: Vec<Pubkey>,
    /// List of the merchants staked
    pub merchant_stake_list: Vec<Pubkey>,
    /// List of the passive stakers
    pub passive_stakers_list: Vec<Pubkey>,
    /// authorized funders
    /// [] because short size, fixed account size, and ease of use on
    /// client due to auto generated account size property
    pub funders: [Pubkey; 4],
    //trailer for future use
    pub trailer: [u8; 31],
}

#[account]
#[derive(Default)]
pub struct User {
    /// Pool the this user belongs to.
    pub pool: Pubkey,
    /// The owner of this account.
    pub owner: Pubkey,

    /// The amount of token claimed.
    pub reward_per_token_complete: u128,
    /// The amount of token pending claim.
    pub reward_per_token_pending: u64,

    /// The amount staked.
    pub balance_staked: u64,
    /// The amount staked.
    pub balance_self_staked: u64,
    /// The timestamp when user created.
    pub registerd_at: i64,
    /// The timestamp when staking tokens first.
    pub first_staked_ts: i64,
    /// The timestamp when staking tokens.
    pub staked_ts: i64,
    /// The number that user staked.
    pub staked_count: u32,
    /// The timestamp when claiming rewards.
    pub claimed_ts: i64,
    /// The number that user claimed.
    pub claimed_count: u32,
    /// The timestamp that token staking ends
    pub end_ts: i64,
    /// Signer nonce.
    pub nonce: u8,

    /// The tiemstamp when admin staked tokens behalf of users/merchants
    pub behalf_staked_ts: Vec<i64>,
    /// The amount of tokens admin staked behalf of users/merchants
    pub behalf_staked_amount: Vec<u64>,
    /// The status users/merchants claimed
    pub behalf_claimed_status: Vec<bool>
}

#[account]
#[derive(Default)]
pub struct Merchant {
    /// Merchant the this user belongs to.
    pub pool: Pubkey,
    /// The owner of this account.
    pub owner: Pubkey,
    /// The amount of token claimed.
    pub reward_per_token_complete: u128,
    /// The amount of token pending claim.
    pub reward_per_token_pending: u64,
    /// The amount staked in the main pool.
    pub self_balance_staked: u64,
    /// The amount staked.
    pub balance_staked: u64,
    /// Users staked
    pub merchant_user_stake_count: u32,
    /// List of Users staked
    pub merchant_user_stake_list: Vec<Pubkey>,
    /// Name of merchant
    pub merchant_name: String,
    /// The timestamp when this merchant created
    pub created_at: i64,
    /// The timestamp when this merchant claims rewards from main pool
    pub last_updated_ts: i64,
    /// Signer nonce.
    pub nonce: u8,
    /// Merchant status
    pub paused: bool,
}

#[account]
#[derive(Default)]
pub struct MerchantUser {
    /// Pool the this user belongs to.
    pub pool: Pubkey,
    /// Merchant the this user belongs to.
    pub merchant: Pubkey,
    /// The owner of this account.
    pub owner: Pubkey,
    /// The amount staked.
    pub balance_staked: u64,
    /// The timestamp when user created.
    pub registerd_at: i64,
    /// The timestamp when staking tokens first.
    pub first_staked_ts: i64,
    /// The timestamp when staking tokens.
    pub staked_ts: i64,
    /// The number that user staked.
    pub staked_count: u32,
    /// The timestamp when claiming rewards.
    pub claimed_ts: i64,
    /// The number that user claimed.
    pub claimed_count: u32,
    /// The timestamp that token staking ends
    pub end_ts: i64,
    /// Signer nonce.
    pub nonce: u8,
}

#[error]
pub enum ErrorCode {
    #[msg("Insufficient funds to unstake.")]
    InsufficientFundUnstake,
    #[msg("Amount must be greater than zero.")]
    AmountMustBeGreaterThanZero,
    #[msg("Reward B cannot be funded - pool is single stake.")]
    SingleStakeTokenBCannotBeFunded,
    #[msg("Pool is paused.")]
    PoolPaused,
    #[msg("Merchant is paused.")]
    MerchantPaused,
    #[msg("Duration cannot be shorter than one day.")]
    DurationTooShort,
    #[msg("Provided funder is already authorized to fund.")]
    FunderAlreadyAuthorized,
    #[msg("Maximum funders already authorized.")]
    MaxFunders,
    #[msg("Cannot deauthorize the primary pool authority.")]
    CannotDeauthorizePoolAuthority,
    #[msg("Authority not found for deauthorization.")]
    CannotDeauthorizeMissingAuthority,
    #[msg("Unstaking not over.")]
    UnstakingNotOver,
    #[msg("Already withdrawn")]
    AlreadyWithdrawn,
    #[msg("No tokens to withdraw")]
    NoTokensToWithdraw,
    #[msg("Not time to withdraw tokens")]
    NotTimeToWithdrawTokens
}
