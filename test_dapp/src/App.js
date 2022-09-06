import React, { useMemo, useCallback } from "react";
import { WalletAdapterNetwork } from "@solana/wallet-adapter-base";
import {
  ConnectionProvider,
  WalletProvider,
} from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import {
  getPhantomWallet,
  getSolletWallet,
} from "@solana/wallet-adapter-wallets";
import { clusterApiUrl } from "@solana/web3.js";
import {
  BrowserRouter as Router,
  Route,
  Redirect,
  Switch,
} from "react-router-dom";
import { ReactNotifications } from 'react-notifications-component'

import Home from "./pages/Home";
import Vesting from "./pages/Vesting";
import MainPool from "./pages/MainPool";
import MerchantPool from "./pages/MerchantPool";
import Admin from "./pages/Admin";
import Navbar from "./components/navbar/Navbar";

import "bootstrap/dist/css/bootstrap.css";
import 'react-notifications-component/dist/theme.css'
import "./App.css";

const App = () => {
  const network = WalletAdapterNetwork.Devnet;
  const endpoint = useMemo(() => clusterApiUrl(network), [network]);

  const wallets = useMemo(() => [getSolletWallet(), getPhantomWallet()], [network]);
  const onError = useCallback((error) => {
    console.log(
      "error",
      error.message ? `${error.name}: ${error.message}` : error.name
    );
    console.log("err", error);
  }, []);
  return (
    <ConnectionProvider endpoint={endpoint}>
      <WalletProvider autoConnect onError={onError} wallets={wallets}>
        <WalletModalProvider>
          <Router>
            <Navbar />
            <ReactNotifications />
            <main>
              <Switch>
                <Route index path="/" exact>
                  <Home />
                </Route>
                <Route path="/vesting">
                  <Vesting />
                </Route>
                <Route path="/main-pool">
                  <MainPool />
                </Route>
                <Route path="/merchant-pool">
                  <MerchantPool />
                </Route>
                <Route path="/admin">
                  <Admin />
                </Route>
                <Redirect to="/" />
              </Switch>
            </main>
          </Router>
        </WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
};

export default App;
