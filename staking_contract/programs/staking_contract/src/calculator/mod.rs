use crate::*;
use pool::*;

mod pool;

/// Retrieve a calculator for a specific pool
pub fn get_calculator() -> Box<dyn RewardCalculator> {
    Box::new(PoolRewardCalculator)
}

/// A reward calculator handles the calculations of reward rates and user reward amounts
pub trait RewardCalculator {
    /// Calculates the current reward per token that should have been paid out
    fn reward_per_token(
        &self,
        pool: &Account<Pool>,
        total_staked: u64,
        last_time_reward_applicable: u64,
    ) -> u128;

    /// Calculates the amount that a user earned
    fn user_earned_amount(&self, pool: &Account<Pool>, user: &Account<User>) -> u64;

    /// Calculates the amount that a merchant earned
    fn merchant_earned_amount(&self, pool: &Account<Pool>, user: &Account<Merchant>) -> u64;
}
