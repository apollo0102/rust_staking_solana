import * as anchor from '@project-serum/anchor';
import { Program } from '@project-serum/anchor';

import {
  PublicKey,
  SystemProgram,
  Transaction,
  Connection,
  Commitment,
} from '@solana/web3.js';
import { TOKEN_PROGRAM_ID, Token } from '@solana/spl-token';
import { assert } from 'chai';

describe('solana-staking', () => {
  const provider = anchor.Provider.env();
  anchor.setProvider(provider);
  const program = anchor.workspace.LinearVesting;

  let mint = null;
  let ownerTokenAccount = null;

  const amount = 1000000 * 10 ** 9;

  const owner = (provider.wallet).payer;
  const beneficiary = anchor.web3.Keypair.generate();
  const mintAuthority = owner;

  let beneficiaryTokenAccount = null;
  let vaultAccount = null;
  let vestingAccount = null;
  let vaultAuthority = null;
  let investorAccount = null;

  it('Initialize vesting contract', async () => {
    [investorAccount] = await PublicKey.findProgramAddress(
      [Buffer.from(anchor.utils.bytes.utf8.encode('investor-account'))],
      program.programId
    );

    await program.rpc.initializeVesting(
      {
        accounts: {
          owner: owner.publicKey,
          investorAccount,
          systemProgram: anchor.web3.SystemProgram.programId,
        },
      }
    );
  })

  it('Initialize vesting account', async () => {
    mint = await Token.createMint(
      provider.connection,
      mintAuthority,
      mintAuthority.publicKey,
      null,
      9,
      TOKEN_PROGRAM_ID
    );

    ownerTokenAccount = await mint.getOrCreateAssociatedAccountInfo(
      owner.publicKey
    );

    await mint.mintTo(
      ownerTokenAccount.address,
      mintAuthority.publicKey,
      [mintAuthority],
      amount
    );

    beneficiaryTokenAccount = await mint.getOrCreateAssociatedAccountInfo(
      owner.publicKey
    );

    [vaultAccount] = await PublicKey.findProgramAddress(
      [
        Buffer.from(anchor.utils.bytes.utf8.encode('token-vault')),
        beneficiaryTokenAccount.address.toBuffer(),
      ],

      program.programId
    );

    [vaultAuthority] = await PublicKey.findProgramAddress(
      [Buffer.from(anchor.utils.bytes.utf8.encode('vault-authority'))],
      program.programId
    );

    [vestingAccount] = await PublicKey.findProgramAddress(
      [beneficiaryTokenAccount.address.toBuffer()],
      program.programId
    );

    [investorAccount] = await PublicKey.findProgramAddress(
      [Buffer.from(anchor.utils.bytes.utf8.encode('investor-account'))],
      program.programId
    );

    const startTs = new anchor.BN(Date.now() / 1000);
    const name = "Investor";

    await program.rpc.initialize(
      new anchor.BN(amount / 2),
      name,
      startTs,
      true,
      {
        accounts: {
          owner: owner.publicKey,
          beneficiary: beneficiary.publicKey,
          mint: mint.publicKey,
          beneficiaryAta: beneficiaryTokenAccount.address,
          vaultAccount: vaultAccount,
          ownerTokenAccount: ownerTokenAccount.address,
          vestingAccount: vestingAccount,
          investorAccount: investorAccount,
          systemProgram: anchor.web3.SystemProgram.programId,
          rent: anchor.web3.SYSVAR_RENT_PUBKEY,
          tokenProgram: TOKEN_PROGRAM_ID,
        },
      }
    );

    let _vault = await mint.getAccountInfo(vaultAccount);
    let _owner = await mint.getAccountInfo(ownerTokenAccount.address);

    console.log("===========vaultAmount=============", _vault.amount.toNumber())
    console.log("===========ownerAmount=============", _owner.amount.toNumber())

    // check token has been transferred to vault
    assert.ok(_vault.amount.toNumber() == amount / 2);

    // check that the vault's authority is the program
    assert.ok(vaultAuthority.equals(_vault.owner));

    let _vestingAccount = await program.account.vestingAccount.fetch(
      vestingAccount
    );

    // check the vesting account has the correct data

    assert.ok(_vestingAccount.totalDepositedAmount.toNumber() === amount / 2);
    assert.ok(_vestingAccount.releasedAmount.toNumber() === 0);
    assert.ok(_vestingAccount.startTs.eq(startTs));
    assert.ok(_vestingAccount.revocable);
    assert.ok(_vestingAccount.beneficiary.equals(beneficiary.publicKey));
    assert.ok(_vestingAccount.owner.equals(owner.publicKey));
    assert.ok(_vestingAccount.mint.equals(mint.publicKey));
  });

  it('disable investor account', async () => {
    [investorAccount] = await PublicKey.findProgramAddress(
      [Buffer.from(anchor.utils.bytes.utf8.encode('investor-account'))],
      program.programId
    );

    await program.rpc.disableAccount(
      {
        accounts: {
          owner: owner.publicKey,
          investorAccount: investorAccount,
          vestingAccount: vestingAccount,
          systemProgram: anchor.web3.SystemProgram.programId,
        },
      }
    );

    let _vestingAccount = await program.account.vestingAccount.fetch(
      vestingAccount
    );

    console.log("===========vestingAccountAfterDisabled=============", _vestingAccount)
  });

  it('enable investor account', async () => {
    await delay(2000);

    [investorAccount] = await PublicKey.findProgramAddress(
      [Buffer.from(anchor.utils.bytes.utf8.encode('investor-account'))],
      program.programId
    );

    await program.rpc.enableAccount(
      {
        accounts: {
          owner: owner.publicKey,
          investorAccount: investorAccount,
          vestingAccount: vestingAccount,
          systemProgram: anchor.web3.SystemProgram.programId,
        },
      }
    );

    let _vestingAccount = await program.account.vestingAccount.fetch(
      vestingAccount
    );

    console.log("===========vestingAccountAfterEnabled=============", _vestingAccount)
  });

  it('rename account', async () => {

    [investorAccount] = await PublicKey.findProgramAddress(
      [Buffer.from(anchor.utils.bytes.utf8.encode('investor-account'))],
      program.programId
    );

    const newName = "New Investor"
    await program.rpc.renameAccount(
      newName,
      {
        accounts: {
          owner: owner.publicKey,
          investorAccount: investorAccount,
          vestingAccount: vestingAccount,
          systemProgram: anchor.web3.SystemProgram.programId,
        },
      }
    );

    let _vestingAccount = await program.account.vestingAccount.fetch(
      vestingAccount
    );

    console.log("===========vestingAccountAfterRenamed=============", _vestingAccount)
  });

  it('Upfront token', async () => {
    await delay(5000);

    await program.rpc.upfront(
      {
        accounts: {
          beneficiary: beneficiary.publicKey,
          beneficiaryAta: beneficiaryTokenAccount.address,
          vaultAccount: vaultAccount,
          vestingAccount: vestingAccount,
          vaultAuthority: vaultAuthority,
          ownerTokenAccount: ownerTokenAccount.address,
          systemProgram: anchor.web3.SystemProgram.programId,
          rent: anchor.web3.SYSVAR_RENT_PUBKEY,
          tokenProgram: TOKEN_PROGRAM_ID,
        },
      }
    );

    let _vault = await mint.getAccountInfo(vaultAccount);
    let _beneficiary = await mint.getAccountInfo(beneficiaryTokenAccount.address);
    let _owner = await mint.getAccountInfo(ownerTokenAccount.address);

    console.log("==========vaultAmountAfterUpfront==============", _vault.amount.toNumber())
    console.log("==========beneficiaryAmountAfterUpfront==============", _beneficiary.amount.toNumber())
    console.log("==========ownerAmountAfterUpfront==============", _owner.amount.toNumber())

    let _vestingAccount = await program.account.vestingAccount.fetch(
      vestingAccount
    );

    const vestingAccountAfterUpfront = {
      beneficiary: _vestingAccount.beneficiary.toBase58(),
      startTs: _vestingAccount.startTs.toNumber(),
      withdrawTs: _vestingAccount.withdrawTs.toNumber(),
      cliffTs: _vestingAccount.cliffTs.toNumber(),
      duration: _vestingAccount.duration.toNumber(),
      revocable: _vestingAccount.revocable,
      owner: _vestingAccount.owner.toBase58(),
      mint: _vestingAccount.mint.toBase58(),
      totalDepositedAmount: _vestingAccount.totalDepositedAmount.toNumber(),
      releasedAmount: _vestingAccount.releasedAmount.toNumber(),
      revoked: _vestingAccount.revoked,
      upfronted: _vestingAccount.upfronted,
    }

    console.log("============vestingAccountAfterWithdraw==============", vestingAccountAfterUpfront)

  });

  it('Withdraw token', async () => {
    await delay(5000);

    const withdrawTs = new anchor.BN(Date.now() / 1000);

    await program.rpc.withdraw(
      withdrawTs,
      {
        accounts: {
          beneficiary: beneficiary.publicKey,
          beneficiaryAta: beneficiaryTokenAccount.address,
          vaultAccount: vaultAccount,
          vestingAccount: vestingAccount,
          vaultAuthority: vaultAuthority,
          ownerTokenAccount: ownerTokenAccount.address,
          systemProgram: anchor.web3.SystemProgram.programId,
          rent: anchor.web3.SYSVAR_RENT_PUBKEY,
          tokenProgram: TOKEN_PROGRAM_ID,
        },
      }
    );

    let _vault = await mint.getAccountInfo(vaultAccount);
    let _beneficiary = await mint.getAccountInfo(beneficiaryTokenAccount.address);
    let _owner = await mint.getAccountInfo(ownerTokenAccount.address);

    console.log("==========vaultAmountAfterWithdraw==============", _vault.amount.toNumber())
    console.log("==========beneficiaryAmountAfterWithdraw==============", _beneficiary.amount.toNumber())
    console.log("==========ownerAmountAfterWithdraw==============", _owner.amount.toNumber())

    let _vestingAccount = await program.account.vestingAccount.fetch(
      vestingAccount
    );

    const vestingAccountAfterWithdraw = {
      beneficiary: _vestingAccount.beneficiary.toBase58(),
      startTs: _vestingAccount.startTs.toNumber(),
      withdrawTs: _vestingAccount.withdrawTs.toNumber(),
      cliffTs: _vestingAccount.cliffTs.toNumber(),
      duration: _vestingAccount.duration.toNumber(),
      revocable: _vestingAccount.revocable,
      owner: _vestingAccount.owner.toBase58(),
      mint: _vestingAccount.mint.toBase58(),
      totalDepositedAmount: _vestingAccount.totalDepositedAmount.toNumber(),
      releasedAmount: _vestingAccount.releasedAmount.toNumber(),
      revoked: _vestingAccount.revoked,
      upfronted: _vestingAccount.upfronted,
    }

    console.log("============vestingAccountAfterWithdraw==============", vestingAccountAfterWithdraw)

  });

  it('Revoke', async () => {
    await program.rpc.revoke(
      {
        accounts: {
          owner: owner.publicKey,
          vaultAccount: vaultAccount,
          vestingAccount: vestingAccount,
          ownerTokenAccount: ownerTokenAccount.address,
          vaultAuthority: vaultAuthority,
          systemProgram: anchor.web3.SystemProgram.programId,
          rent: anchor.web3.SYSVAR_RENT_PUBKEY,
          tokenProgram: TOKEN_PROGRAM_ID,
        },
        // signers: [owner],
      }
    );

    let _vault = await mint.getAccountInfo(vaultAccount);

    let _beneficiary = await mint.getAccountInfo(beneficiaryTokenAccount.address);
    let _owner = await mint.getAccountInfo(ownerTokenAccount.address);

    console.log("==========vaultAmountAfterRevoke==============", _vault.amount.toNumber())
    console.log("==========beneficiaryAmountAfterRevoke==============", _beneficiary.amount.toNumber())
    console.log("==========ownerAmountAfterRevoke==============", _owner.amount.toNumber())


    // check token has been transferred to vault
    assert.ok(_vault.amount.toNumber() == 0);

    let _vestingAccount = await program.account.vestingAccount.fetch(
      vestingAccount
    );
    assert.ok(_vestingAccount.revoked);

  });
});

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}