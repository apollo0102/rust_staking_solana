use crate::calculator::*;
use spl_math::uint::U192;

pub struct PoolRewardCalculator;

impl RewardCalculator for PoolRewardCalculator {
    fn reward_per_token(
        &self,
        pool: &Account<Pool>,
        total_staked: u64,
        last_time_reward_applicable: u64,
    ) -> u128 {
        if total_staked == 0 {
            return pool.reward_per_token_stored;
        }

        let time_period = U192::from(last_time_reward_applicable)
            .checked_sub(pool.last_update_time.into())
            .unwrap();
        let reward = pool
            .reward_per_token_stored
            .checked_add(
                time_period
                    .checked_mul(REWARD_RATE.into())
                    .unwrap()
                    .checked_mul(PRECISION.into())
                    .unwrap()
                    .checked_div(total_staked.into())
                    .unwrap()
                    .try_into()
                    .unwrap(), //back to u128
            )
            .unwrap();

        reward
    }

    fn user_earned_amount(
        &self,
        pool: &anchor_lang::Account<Pool>,
        user: &anchor_lang::Account<User>,
    ) -> u64 {
        let user_reward: u64 = (user.balance_staked as u128)
            .checked_mul(
                (pool.reward_per_token_stored as u128)
                    .checked_sub(user.reward_per_token_complete as u128)
                    .unwrap(),
            )
            .unwrap()
            .checked_div(PRECISION)
            .unwrap()
            .checked_add(user.reward_per_token_pending as u128)
            .unwrap()
            .try_into()
            .unwrap(); //back to u64

        user_reward
    }

    fn merchant_earned_amount(
        &self,
        pool: &anchor_lang::Account<Pool>,
        merchant: &anchor_lang::Account<Merchant>,
    ) -> u64 {
        let merchant_reward: u64 = (merchant.balance_staked as u128)
            .checked_mul(
                (pool.reward_per_token_stored as u128)
                    .checked_sub(merchant.reward_per_token_complete as u128)
                    .unwrap(),
            )
            .unwrap()
            .checked_div(PRECISION)
            .unwrap()
            .checked_add(merchant.reward_per_token_pending as u128)
            .unwrap()
            .try_into()
            .unwrap(); //back to u64

        merchant_reward
    }
}
