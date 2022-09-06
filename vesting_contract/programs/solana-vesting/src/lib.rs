use anchor_lang::{prelude::*};
use anchor_spl::token::{self, Mint, SetAuthority, TokenAccount, Transfer};
use spl_token::instruction::AuthorityType;
pub mod error;
use crate::{error::LinearVestingError};

declare_id!("A61XuzXmCHwTcaHEiQ1wJgpp3crMMdoxRY3hXau7LnRP");

const VAULT_PDA_SEED: &[u8] = b"token-vault";
const VAULT_AUTHORITY_PDA_SEED: &[u8] = b"vault-authority";
const INVESTOR_ACCOUNT_PDA_SEED: &[u8] = b"investor-account";

const UPFRONT_PERCENT: u64 = 1000;
const WITHDRAW_PERCENT: u64 = 375;
const WITHDRAW_PERIOD: i64 = 1;
// const WITHDRAW_PERIOD: i64 = 1 * 30 * 86400;


#[program]
pub mod solana_vesting {
    use super::*;

    pub fn initialize_vesting(
        ctx: Context<InitializeVesting>,
    ) -> ProgramResult {
        ctx.accounts.investor_account.owner = *ctx.accounts.owner.key;
        Ok(())
    }

    pub fn initialize(
        ctx: Context<Initialize>,
        amount: u64,
        name: String,
        start_ts: i64,
        revocable: bool,
    ) -> ProgramResult {

        if ctx.accounts.owner.key != &ctx.accounts.investor_account.owner {
            return Err(LinearVestingError::OwnerNotMatched.into());
        }

        ctx.accounts.vesting_account.start_ts = start_ts;
        ctx.accounts.vesting_account.withdraw_ts = start_ts;
        ctx.accounts.vesting_account.revocable = revocable;
        ctx.accounts.vesting_account.name = name;

        ctx.accounts.vesting_account.beneficiary = *ctx.accounts.beneficiary.key;
        ctx.accounts.vesting_account.owner = *ctx.accounts.owner.key;
        ctx.accounts.vesting_account.mint = *ctx.accounts.mint.to_account_info().key;

        ctx.accounts.vesting_account.total_deposited_amount = amount;
        ctx.accounts.vesting_account.released_amount = 0;
        ctx.accounts.vesting_account.claimed_count = 0;
        ctx.accounts.vesting_account.revoked = false;
        ctx.accounts.vesting_account.upfronted = false;
        ctx.accounts.vesting_account.approved = true;

        // register an investor to list
        let investor_account = &mut ctx.accounts.investor_account;
        investor_account.investors.push(*ctx.accounts.beneficiary.key);


        let (vault_authority, _vault_authority_bump) =
            Pubkey::find_program_address(&[VAULT_AUTHORITY_PDA_SEED], ctx.program_id);
        
        token::set_authority(
            ctx.accounts.into_set_authority_context(),
            AuthorityType::AccountOwner,
            Some(vault_authority),
        )?;

        token::transfer(
            ctx.accounts.into_transfer_to_pda_context(),
            ctx.accounts.vesting_account.total_deposited_amount,
        )?;

        Ok(())
    }

    pub fn add_token_to_vesting(
        ctx: Context<AddTokenToVestingAccount>,
        amount: u64,
    ) -> ProgramResult {

        if ctx.accounts.vesting_account.claimed_count > 0 {
            return Err(LinearVestingError::AddTokenNotAllowed.into());
        }
        
        ctx.accounts.vesting_account.total_deposited_amount += amount;
        
        token::transfer(
            ctx.accounts.into_transfer_to_pda_context(),
            amount,
        )?;

        Ok(())
    }

    pub fn upfront(
        ctx: Context<Upfront>,
        current_ts: i64
    ) -> ProgramResult {
        if ctx.accounts.vesting_account.upfronted {
            return Err(LinearVestingError::AlreadyUpfronted.into());
        }

        if !ctx.accounts.vesting_account.approved {
            return Err(LinearVestingError::NotApproved.into());
        }

        let current_balance = ctx.accounts.vault_account.amount;
        let total_balance = current_balance + ctx.accounts.vesting_account.released_amount;
        let unreleased_token = total_balance * UPFRONT_PERCENT / 100 / 100;

        ctx.accounts.vesting_account.released_amount = ctx
            .accounts
            .vesting_account.released_amount
            .checked_add(unreleased_token)
            .unwrap();

        ctx.accounts.vesting_account.claimed_count = ctx
            .accounts
            .vesting_account.claimed_count
            .checked_add(1)
            .unwrap();

        ctx.accounts.vesting_account.upfronted = true;
        ctx.accounts.vesting_account.withdraw_ts = current_ts;

        let (_vault_authority, vault_authority_bump) =
            Pubkey::find_program_address(&[VAULT_AUTHORITY_PDA_SEED], ctx.program_id);
        let authority_seeds = &[&VAULT_AUTHORITY_PDA_SEED[..], &[vault_authority_bump]];
        
        token::transfer(
            ctx.accounts.into_transfer_to_owner_context().with_signer(&[&authority_seeds[..]]),
            unreleased_token,
        )?;

        Ok(())
    }

    pub fn withdraw(
        ctx: Context<Withdraw>,
        withdraw_ts: i64,
    ) -> ProgramResult {

        if !ctx.accounts.vesting_account.upfronted {
            return Err(LinearVestingError::NotYetUpfronted.into());
        }

        if !ctx.accounts.vesting_account.approved {
            return Err(LinearVestingError::NotApproved.into());
        }

        let current_time = withdraw_ts;
        if ctx.accounts.vesting_account.withdraw_ts + WITHDRAW_PERIOD > current_time {
            return Err(LinearVestingError::WaitForWithdrawPeriod.into());
        }

        let current_balance = ctx.accounts.vault_account.amount;
        let total_balance = current_balance + ctx.accounts.vesting_account.released_amount;
        if current_balance <= 0 {
            return Err(LinearVestingError::NoTokens.into());
        }
        
        let unreleased_token = total_balance * WITHDRAW_PERCENT / 10000;

        ctx.accounts.vesting_account.released_amount = ctx
            .accounts
            .vesting_account.released_amount
            .checked_add(unreleased_token)
            .unwrap();
        
        ctx.accounts.vesting_account.claimed_count = ctx
            .accounts
            .vesting_account.claimed_count
            .checked_add(1)
            .unwrap();

        ctx.accounts.vesting_account.withdraw_ts = current_time;

        let (_vault_authority, vault_authority_bump) =
            Pubkey::find_program_address(&[VAULT_AUTHORITY_PDA_SEED], ctx.program_id);
        let authority_seeds = &[&VAULT_AUTHORITY_PDA_SEED[..], &[vault_authority_bump]];
        
        token::transfer(
            ctx.accounts.into_transfer_to_owner_context().with_signer(&[&authority_seeds[..]]),
            unreleased_token,
        )?;

        Ok(())
    }

    pub fn enable_account(
        ctx: Context<EnableAccount>,
    ) -> ProgramResult {
        if ctx.accounts.owner.key != &ctx.accounts.investor_account.owner {
            return Err(LinearVestingError::OwnerNotMatched.into());
        }

        if ctx.accounts.vesting_account.approved {
            return Err(LinearVestingError::AlreadyEnabled.into());
        }

        ctx.accounts.vesting_account.approved = true;
        ctx.accounts.vesting_account.revoked = false;
        Ok(())
    }

    pub fn disable_account(
        ctx: Context<DisableAccount>,
    ) -> ProgramResult {
        if ctx.accounts.owner.key != &ctx.accounts.investor_account.owner {
            return Err(LinearVestingError::OwnerNotMatched.into());
        }

        if !ctx.accounts.vesting_account.approved {
            return Err(LinearVestingError::AlreadyDisabled.into());
        }

        ctx.accounts.vesting_account.approved = false;
        Ok(())
    }

    pub fn rename_account(
        ctx: Context<RenameAccount>,
        name: String
    ) -> ProgramResult {
        if ctx.accounts.owner.key != &ctx.accounts.investor_account.owner {
            return Err(LinearVestingError::OwnerNotMatched.into());
        }

        if !ctx.accounts.vesting_account.approved {
            return Err(LinearVestingError::AlreadyDisabled.into());
        }

        ctx.accounts.vesting_account.name = name;
        Ok(())
    }

    pub fn revoke(
        ctx: Context<Revoke>
    ) -> ProgramResult {
        if ctx.accounts.owner.key != &ctx.accounts.vesting_account.owner {
            return Err(LinearVestingError::NoMatchOwner.into());
        }
        if !ctx.accounts.vesting_account.revocable {
            return Err(LinearVestingError::NoRevoke.into());
        }
        if ctx.accounts.vesting_account.revoked {
            return Err(LinearVestingError::AlreadyRevoked.into());
        }

        let current_balance = ctx.accounts.vault_account.amount;

        let refund = current_balance;
        ctx.accounts.vesting_account.revoked = true;
        ctx.accounts.vesting_account.approved = false;
        // ctx.accounts.vesting_account.released_amount += refund;
        ctx.accounts.vesting_account.total_deposited_amount = ctx
            .accounts
            .vesting_account.total_deposited_amount
            .checked_sub(refund)
            .unwrap();

        let (_vault_authority, vault_authority_bump) =
            Pubkey::find_program_address(&[VAULT_AUTHORITY_PDA_SEED], ctx.program_id);
        let authority_seeds = &[&VAULT_AUTHORITY_PDA_SEED[..], &[vault_authority_bump]];
        
        token::transfer(
            ctx.accounts.into_transfer_to_owner_context().with_signer(&[&authority_seeds[..]]),
            refund,
        )?;

        Ok(())
    }

}

#[derive(Accounts)]
pub struct InitializeVesting<'info> {
    #[account(
        init,
        seeds = [INVESTOR_ACCOUNT_PDA_SEED],
        bump,
        payer = owner,
        space = 8 * 25
    )]
    pub investor_account: Account<'info, InvestorAccount>,
    pub owner: Signer<'info>,
    pub system_program: AccountInfo<'info>,
}

#[derive(Accounts)]
pub struct EnableAccount<'info> {
    #[account(mut)]
    pub investor_account: Account<'info, InvestorAccount>,
    #[account(mut)]
    pub vesting_account: Box<Account<'info, VestingAccount>>,
    pub owner: Signer<'info>,
    pub system_program: AccountInfo<'info>,
}

#[derive(Accounts)]
pub struct DisableAccount<'info> {
    #[account(mut)]
    pub investor_account: Account<'info, InvestorAccount>,
    #[account(mut)]
    pub vesting_account: Box<Account<'info, VestingAccount>>,
    pub owner: Signer<'info>,
    pub system_program: AccountInfo<'info>,
}

#[derive(Accounts)]
pub struct RenameAccount<'info> {
    #[account(mut)]
    pub investor_account: Account<'info, InvestorAccount>,
    #[account(mut)]
    pub vesting_account: Box<Account<'info, VestingAccount>>,
    pub owner: Signer<'info>,
    pub system_program: AccountInfo<'info>,
}

#[derive(Accounts)]
#[instruction(amount: u64,
    name: String,
  start_ts: i64,
  revocable: bool)]
pub struct Initialize<'info> {
    #[account(mut)]
    pub owner: AccountInfo<'info>,
    pub beneficiary: AccountInfo<'info>,
    pub mint: Account<'info, Mint>,
    #[account(mut)]
    pub beneficiary_ata: Account<'info, TokenAccount>,
    #[account(
        init,
        seeds = [VAULT_PDA_SEED, &beneficiary_ata.to_account_info().key.to_bytes()], bump,
        payer = owner,
        token::mint = mint,
        token::authority = owner,
    )]
    pub vault_account: Account<'info, TokenAccount>,
    #[account(
        mut,
        constraint = owner_token_account.amount >= amount
    )]
    pub owner_token_account: Account<'info, TokenAccount>,
    #[account(
        init,
        seeds = [&beneficiary_ata.to_account_info().key.to_bytes()],
        bump,
        payer = owner,
        space = 8 * 25
    )]
    pub vesting_account: Box<Account<'info, VestingAccount>>,
    #[account(mut)]
    pub investor_account: Account<'info, InvestorAccount>,
    pub system_program: AccountInfo<'info>,
    pub rent: Sysvar<'info, Rent>,
    pub token_program: AccountInfo<'info>,
}

#[account]
pub struct InvestorAccount {
    /// The investor who will received tokens
    pub investors: Vec<Pubkey>,
    /// Owner that can revoke the account
    pub owner: Pubkey
}

#[derive(Accounts)]
pub struct AddTokenToVestingAccount<'info> {
    #[account(mut)]
    pub owner: AccountInfo<'info>,
    #[account(mut)]
    pub vault_account: Account<'info, TokenAccount>,
    #[account(mut)]
    pub vesting_account: Box<Account<'info, VestingAccount>>,
    #[account(mut)]
    pub owner_token_account: Account<'info, TokenAccount>,
    pub system_program: AccountInfo<'info>,
    pub rent: Sysvar<'info, Rent>,
    pub token_program: AccountInfo<'info>,
}

#[derive(Accounts)]
pub struct Upfront<'info> {
    #[account(mut)]
    pub beneficiary: AccountInfo<'info>,
    #[account(mut)]
    pub beneficiary_ata: Account<'info, TokenAccount>,
    #[account(mut)]
    pub vault_account: Account<'info, TokenAccount>,
    #[account(mut)]
    pub vesting_account: Box<Account<'info, VestingAccount>>,
    pub vault_authority: AccountInfo<'info>,
    #[account(mut)]
    pub owner_token_account: Account<'info, TokenAccount>,
    pub system_program: AccountInfo<'info>,
    pub rent: Sysvar<'info, Rent>,
    pub token_program: AccountInfo<'info>,
}

#[derive(Accounts)]
pub struct Withdraw<'info> {
    #[account(mut)]
    pub beneficiary: AccountInfo<'info>,
    #[account(mut)]
    pub beneficiary_ata: Account<'info, TokenAccount>,
    #[account(mut)]
    pub vault_account: Account<'info, TokenAccount>,
    #[account(mut)]
    pub vesting_account: Box<Account<'info, VestingAccount>>,
    pub vault_authority: AccountInfo<'info>,
    #[account(mut)]
    pub owner_token_account: Account<'info, TokenAccount>,
    pub system_program: AccountInfo<'info>,
    pub rent: Sysvar<'info, Rent>,
    pub token_program: AccountInfo<'info>,
}

#[derive(Accounts)]
pub struct Revoke<'info> {
    #[account(mut)]
    pub owner: AccountInfo<'info>,
    #[account(mut)]
    pub vault_account: Account<'info, TokenAccount>,
    #[account(mut)]
    pub vesting_account: Box<Account<'info, VestingAccount>>,
    #[account(mut)]
    pub owner_token_account: Account<'info, TokenAccount>,
    pub vault_authority: AccountInfo<'info>,
    pub system_program: AccountInfo<'info>,
    pub rent: Sysvar<'info, Rent>,
    pub token_program: AccountInfo<'info>,
}

#[account]
#[derive(Default)]
pub struct VestingAccount {
    /// The investor who will received vested tokens
    pub beneficiary: Pubkey,
    /// The timestamp for when the lock ends and vesting begins
    pub start_ts: i64,
    /// The timestamp for when withdraw
    pub withdraw_ts: i64,
    /// The timestamp for when the cliff ends (vesting happens during cliff!)
    pub cliff_ts: i64,
    /// The duration of the vesting period
    pub duration: i64,
    /// Whether this vesting account is revocable
    pub revocable: bool,
    /// Owner that can revoke the account
    pub owner: Pubkey,
    /// The name of an investor
    pub name: String,
    /// The mint of the SPL token locked up.
    pub mint: Pubkey,
    /// Total amount to be vested
    pub total_deposited_amount: u64,
    /// Amount that has been released
    pub released_amount: u64,
    /// Claimed count
    pub claimed_count: u8,
    /// The account is revoked
    pub revoked: bool,
    /// upfronted
    pub upfronted: bool,
    /// Approved status
    pub approved: bool
}

impl<'info> Initialize<'info> {
    fn into_transfer_to_pda_context(&self) -> CpiContext<'_, '_, '_, 'info, Transfer<'info>> {
        let cpi_accounts = Transfer {
            from: self.owner_token_account.to_account_info().clone(),
            to: self.vault_account.to_account_info().clone(),
            authority: self.owner.clone(),
        };
        CpiContext::new(self.token_program.clone(), cpi_accounts)
    }

    fn into_set_authority_context(&self) -> CpiContext<'_, '_, '_, 'info, SetAuthority<'info>> {
        let cpi_accounts = SetAuthority {
            account_or_mint: self.vault_account.to_account_info().clone(),
            current_authority: self.owner.clone(),
        };
        CpiContext::new(self.token_program.clone(), cpi_accounts)
    }
}

impl<'info> AddTokenToVestingAccount<'info> {
    fn into_transfer_to_pda_context(&self) -> CpiContext<'_, '_, '_, 'info, Transfer<'info>> {
        let cpi_accounts = Transfer {
            from: self.owner_token_account.to_account_info().clone(),
            to: self.vault_account.to_account_info().clone(),
            authority: self.owner.clone(),
        };
        CpiContext::new(self.token_program.clone(), cpi_accounts)
    }
}

impl<'info> Upfront<'info> {
    fn into_transfer_to_owner_context(&self) -> CpiContext<'_, '_, '_, 'info, Transfer<'info>> {
        let cpi_accounts = Transfer {
            from: self.vault_account.to_account_info().clone(),
            to: self.owner_token_account.to_account_info().clone(),
            authority: self.vault_authority.clone(),
        };
        CpiContext::new(self.token_program.clone(), cpi_accounts)
    }
}

impl<'info> Withdraw<'info> {
    fn into_transfer_to_owner_context(&self) -> CpiContext<'_, '_, '_, 'info, Transfer<'info>> {
        let cpi_accounts = Transfer {
            from: self.vault_account.to_account_info().clone(),
            to: self.owner_token_account.to_account_info().clone(),
            authority: self.vault_authority.clone(),
        };
        CpiContext::new(self.token_program.clone(), cpi_accounts)
    }
}

impl<'info> Revoke<'info> {
    fn into_transfer_to_owner_context(&self) -> CpiContext<'_, '_, '_, 'info, Transfer<'info>> {
        let cpi_accounts = Transfer {
            from: self.vault_account.to_account_info().clone(),
            to: self.owner_token_account.to_account_info().clone(),
            authority: self.vault_authority.clone(),
        };
        CpiContext::new(self.token_program.clone(), cpi_accounts)
    }
}