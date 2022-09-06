# Bind.com vesting and staking contract

## Prerequisites
### Install Nodejs
I recommend installing Node using nvm

### Anchor installation
- Install Rust
```
$ curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
$ source $HOME/.cargo/env
$ rustup component add rustfmt
```
- Install Yarn
```
$ npm install -g yarn
```
- Install Anchor

Install avm
```
$ sudo apt-get update && sudo apt-get upgrade && sudo apt-get install -y pkg-config build-essential libudev-dev
```
```
$ cargo install --git https://github.com/project-serum/anchor avm --locked --force
```

Check avm lists
```
$ avm list
```

Install specific version of anchor and set version
```
$ avm install 0.20.0
```
```
$ avm use 0.20.0
```

Now verify the Anchor CLI is installed properly.
```
$ anchor --version
```

### Install the Solana Tool Suite
Navigate to https://github.com/solana-labs/solana/releases/latest, and download the Source Code archive(tar.gz).
Extract the code and build the binaries with:
```
$ ./scripts/cargo-install-all.sh .
```

After installation, you can see `export PATH="/home/USER/Downloads/solana-version"/bin:"$PATH"`
Copy, save and execute above command line.

Now verify the Solana tool suite is installed properly.
```
$ solana --version
```

## Configuration
- Generate solana wallet using cli
```
$ solana-keygen new -o ~/.config/solana/id.json
```
- Now verify the wallet is generated properly. 
```
$ solana address
``` 
- Set api url to localhost
```
$ solana config set --url localhost
```

## Test contract
### Clone the git repository
```
$ cd ~/
$ git clone https://github.com/bind-com/solana.git bind-com
```
### Vesting contract
```
$ cd ~/bind-com/vesting_contract
$ yarn install
```

To compile this program, we can run the Anchor build command:
```
$ anchor build
```

Test the program by running the test script:
```
$ anchor test
```

### Staking contract
```
$ cd ~/bind-com/staking_contract
$ yarn install
```

To compile this program, we can run the Anchor build command:
```
$ anchor build
```

Test the program by running the test script:
```
$ anchor test
```

## SPL TOKEN Reference Guide
### Setup
The spl-token command-line utility can be used to experiment with SPL tokens. Once you have installed Solana environment, run:
```
$ cargo install spl-token-cli
```
Run spl-token --help for a full description of available commands.

### Configuration
The spl-token configuration is shared with the solana command-line tool.
#### Current Configuration
```
$ solana config get
Config File: ${HOME}/.config/solana/cli/config.yml
RPC URL: https://api.mainnet-beta.solana.com
WebSocket URL: wss://api.mainnet-beta.solana.com/ (computed)
Keypair Path: ${HOME}/.config/solana/id.json
```
#### Cluster RPC URL
```
$ solana config set --url https://api.devnet.solana.com
```
#### Get Default Keypair Address
```
$ solana address
```
#### Airdrop SOL
```
$ solana airdrop 1
```

### Example: Creating your own fungible token
```
$ spl-token create-token
Creating token AQoKYV7tYpTrFZN6P5oUufbQKAUr9mNYGe1TTJC9wajM
Signature: 47hsLFxWRCg8azaZZPSnQR8DNTRsGyPNfUK7jqyzgt7wf9eag3nSnewqoZrVZHKm8zt3B6gzxhr91gdQ5qYrsRG4
```
The unique identifier of the token(token mint address) is AQoKYV7tYpTrFZN6P5oUufbQKAUr9mNYGe1TTJC9wajM

Tokens when initially created by spl-token have no supply:
```
$ spl-token supply AQoKYV7tYpTrFZN6P5oUufbQKAUr9mNYGe1TTJC9wajM
0
```

Let's mint some. First create an account to hold a balance of the new AQoKYV7tYpTrFZN6P5oUufbQKAUr9mNYGe1TTJC9wajM token:
```
$ spl-token create-account AQoKYV7tYpTrFZN6P5oUufbQKAUr9mNYGe1TTJC9wajM
Creating account 7UX2i7SucgLMQcfZ75s3VXmZZY4YRUyJN9X1RgfMoDUi
Signature: 42Sa5eK9dMEQyvD9GMHuKxXf55WLZ7tfjabUKDhNoZRAxj9MsnN7omriWMEHXLea3aYpjZ862qocRLVikvkHkyfy
```

7UX2i7SucgLMQcfZ75s3VXmZZY4YRUyJN9X1RgfMoDUi is now an empty account:
```
$ spl-token balance AQoKYV7tYpTrFZN6P5oUufbQKAUr9mNYGe1TTJC9wajM
0
```

Mint 100 tokens into the account:
```
$ spl-token mint AQoKYV7tYpTrFZN6P5oUufbQKAUr9mNYGe1TTJC9wajM 100
Minting 100 tokens
  Token: AQoKYV7tYpTrFZN6P5oUufbQKAUr9mNYGe1TTJC9wajM
  Recipient: 7UX2i7SucgLMQcfZ75s3VXmZZY4YRUyJN9X1RgfMoDUi
Signature: 41mARH42fPkbYn1mvQ6hYLjmJtjW98NXwd6pHqEYg9p8RnuoUsMxVd16RkStDHEzcS2sfpSEpFscrJQn3HkHzLaa
```

The token supply and account balance now reflect the result of minting:
```
$ spl-token balance AQoKYV7tYpTrFZN6P5oUufbQKAUr9mNYGe1TTJC9wajM
100
```

### Example: View all Tokens that you own
```
$ spl-token accounts
Token                                         Balance
------------------------------------------------------------
7e2X5oeAAJyUTi4PfSGXFLGhyPw2H8oELm1mx87ZCgwF  84
AQoKYV7tYpTrFZN6P5oUufbQKAUr9mNYGe1TTJC9wajM  100
AQoKYV7tYpTrFZN6P5oUufbQKAUr9mNYGe1TTJC9wajM  0    (Aux-1*)
AQoKYV7tYpTrFZN6P5oUufbQKAUr9mNYGe1TTJC9wajM  1    (Aux-2*)
```

### Example: Transferring tokens to an explicit recipient token account
Tokens may be transferred to a specific recipient token account. The recipient token account must already exist and be of the same Token type.
```
$ spl-token transfer --fund-recipient --allow-unfunded-recipient AQoKYV7tYpTrFZN6P5oUufbQKAUr9mNYGe1TTJC9wajM 50 vines1vzrYbzLMRdu58ou5XTby4qAqVRLmqo36NKPTg
Transfer 50 tokens
  Sender: 7UX2i7SucgLMQcfZ75s3VXmZZY4YRUyJN9X1RgfMoDUi
  Recipient: vines1vzrYbzLMRdu58ou5XTby4qAqVRLmqo36NKPTg
  Recipient associated token account: F59618aQB8r6asXeMcB9jWuY6NEx1VduT9yFo1GTi1ks
  Funding recipient: F59618aQB8r6asXeMcB9jWuY6NEx1VduT9yFo1GTi1ks (0.00203928 SOL)

Signature: 5a3qbvoJQnTAxGPHCugibZTbSu7xuTgkxvF4EJupRjRXGgZZrnWFmKzfEzcqKF2ogCaF4QKVbAtuFx7xGwrDUcGd
```
vines1vzrYbzLMRdu58ou5XTby4qAqVRLmqo36NKPTg is your wallet address

## How to register new spl-token(Naming and Logo)
A new spl-token is created and live on Solana, but is not yet officially recognized. So need to get all the required information for the token ready for submission.
The official registry of all SPL Tokens lives on [this GitHub repository](https://github.com/solana-labs/token-list) hosted by the Solana Labs team. To get our token recognized, you have to make a pull request in a very specific manner.

- Head on over to the previously mentioned [GitHub repo](https://github.com/solana-labs/token-list) and click the “Fork” button in the top right corner.
- Clone the [Solana token list](https://github.com/solana-labs/token-list):
```
git clone https://github.com/solana-labs/token-list
```

You now have the token-list cloned, so we can add our token's image and information for uploading.
- You will need to create the directory matching the **tokenAddress(mint address)** inside of ```token-list/assets/mainnet/```.
- Copy and paste your token's logo inside the cloned ```token-list``` , in the ```token-list/assets/mainnet/<mint address>/directory```.
For example: ```token-list/assets/mainnet/AQoKYV7tYpTrFZN6P5oUufbQKAUr9mNYGe1TTJC9wajM/logo.png```

Go ahead and name the logo file logo.png for raster logos or logo.svgif you are using vector graphics. Solana prefers logos be either one of those file types.
- Open the token list file at token-list/src/tokens/solana.tokenlist.json to add your token to the list like so:
```
{
  "chainId": 101,
  "address": "AQoKYV7tYpTrFZN6P5oUufbQKAUr9mNYGe1TTJC9wajM",
  "symbol": "$BIND",
  "name": "Bind Com Token",
  "decimals": 9,
  "logoURI": "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/AQoKYV7tYpTrFZN6P5oUufbQKAUr9mNYGe1TTJC9wajM/logo.png",
  "extensions": {
    "website": "https://bind.com/"
  }
}
```

**Some Notes**
```
"chainId": 101(For mainnet-beta)
"chainId": 103(For devnet)
```

The link for the token image must point at the GitHub user content site; just change the token address to your token address, and the logo filename to your logo filename and type.
- Save the token-list/src/tokens/solana.tokenlist.json file.

This will add the token-list GitHub repository to your GitHub, which will enable you to upload your changes to the forked repository and then request the original repository to accept your changes.

- While still inside your token-list folder in the command line, set the url of your local repository to your forked version on GitHub:
```
git remote set-url origin https://github.com/<YOUR GITHUB USERNAME>/token-list
```

Add all the files from the token-list to your local repository:
```
git add .
```

- Commit the files:
```
git commit -m "first commit for $BIND & Bind Com Token"
```

Push the changes:
```
git push origin main
```

You should now see the changes in your forked repository on GitHub.
- Go to the token list [pull requests page](https://github.com/solana-labs/token-list/pulls)
- Select the **New pull request** button



![New pull request](https://github.com/bind-com/solana/blob/main/images/1.png)





- Select the highlighted **compare across forks** option in the subtitle below the **Compare changes** header



![Compare across forks](https://github.com/bind-com/solana/blob/main/images/2.png)





- Select your forked repository from the **head repository** dropdown list



![Select head repository](https://github.com/bind-com/solana/blob/main/images/3.png)





You should see 2 changed files; your token changes and the logo image.
- Ensure these details are correct. For example, the directory containing the logo image should exactly match your token address in the token list.
You are now ready to create the pull request.
- Go ahead and click the green Create pull request button.
- Once finished adding a title and filling out the details, press the green Create pull request button again.

In a few hours, your changes will be merged into the official token registry. These changes won’t be reflected overnight: it may take some services like Phantom or the block explorer a few days to pick up the new metadata. You’ll know the changes went through when you can view your logo at the logoUrl you provided in the JSON object. After a few days, the rest of Solana will pick up on your new branding.