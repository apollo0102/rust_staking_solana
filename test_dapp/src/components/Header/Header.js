import React  from "react";
import './Header.css';

const Header =(props) => {
    return (
      <div className="header">
        <div className="headtext">
          {props.heading}
        </div>
        <hr/>
      </div>

    )
  }
  
  export default Header;