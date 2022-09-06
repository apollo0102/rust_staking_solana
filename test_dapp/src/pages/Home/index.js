import React from "react";
import { NavLink } from "react-router-dom";
import './index.css'
import { useState, useEffect } from "react";
import image from "./../../img/stars.png";
import image1 from "./../../img/mountain_front.png";
import image2 from "./../../img/moon.png";


const Home = () => {
  const [offsetY, setOffsetY] = useState(0);
  const [margin, setMargin] = useState("10%");

  const handleScroll = () => {
    setOffsetY(window.pageYOffset);
    setMargin({ margin: "-5%" });
  };
  useEffect(() => {
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <>
      <section>
        <img
          className="img"
          src={image}
          id="background"
          style={{ transform: `translateX(${-offsetY * 0.5}px)` }}
        />
        <div className="moons">
          <img className="img" src={image2} id="moon" />
        </div>
        <h2
          id="text"
          style={{
            transform: `translateY(${offsetY * 0.4}px)`,
            marginBottom: `${margin}`,
          }}
        >
          {" "}
          Bind.Com
        </h2>
        {/* <a
          href="/admin"
          className="btn"
          id="btns"
          style={{ transform: `translateY(${offsetY * 0.3}px)` }}
        >
          Go to Admin Panel
        </a> */}
        <img className="img" src={image1} id="mountain" />
      </section>
      <div className="main-cont" id="body">

      </div>
    </>
  );
};

export default Home;
