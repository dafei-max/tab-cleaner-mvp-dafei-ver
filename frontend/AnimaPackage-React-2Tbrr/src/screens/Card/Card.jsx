import React from "react";
import { ClipPathGroup2 } from "../../icons/ClipPathGroup2";
import "./style.css";

export const Card = () => {
  return (
    <div className="card">
      <div className="div">
        <img className="draggable" alt="Draggable" src="/img/draggable-2.svg" />

        <div className="window-button">
          <div className="image">
            <div className="window">
              <div className="group">
                <div className="group-wrapper">
                  <div className="group-2" />
                </div>
              </div>

              <img className="vector" alt="Vector" src="/img/vector-6.svg" />

              <ClipPathGroup2 className="clip-path-group" />
            </div>

            <div className="ellipse" />
          </div>
        </div>
      </div>

      <div className="buttons">
        <img
          className="home-button"
          alt="Home button"
          src="/img/home-button-2.png"
        />

        <img
          className="clean-button"
          alt="Clean button"
          src="/img/clean-button.png"
        />

        <img
          className="details-button"
          alt="Details button"
          src="/img/details-button.svg"
        />
      </div>
    </div>
  );
};
