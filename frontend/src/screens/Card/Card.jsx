import React from "react";
import { ClipPathGroup2 } from "../../icons/ClipPathGroup2";
import "./style.css";

// 获取图片 URL（支持扩展环境和普通环境）
function getImageUrl(path) {
  if (typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.getURL) {
    return chrome.runtime.getURL(path);
  }
  return path;
}

export const Card = ({ onHomeClick, onCleanClick, onDetailsClick }) => {
  return (
    <div className="card">
      <img 
        className="draggable" 
        alt="Draggable" 
        src={getImageUrl("static/img/draggable-2.svg")} 
      />

      <div className="window-button">
        <div className="image">
          <div className="window">
            <div className="group">
              <div className="group-wrapper">
                <div className="group-2" />
              </div>
            </div>

            <img 
              className="vector" 
              alt="Vector" 
              src={getImageUrl("static/img/vector-6.svg")} 
            />

            <ClipPathGroup2 className="clip-path-group" />
          </div>

          <div className="ellipse" />
        </div>
      </div>

      <div className="buttons">
        <img
          className="home-button"
          alt="Home button"
          src={getImageUrl("static/img/home-button-2.png")}
          onClick={onHomeClick}
          style={{ cursor: "pointer" }}
        />

        <img
          className="clean-button"
          alt="Clean button"
          src={getImageUrl("static/img/clean-button.png")}
          onClick={onCleanClick}
          style={{ cursor: "pointer" }}
        />

        <img
          className="details-button"
          alt="Details button"
          src={getImageUrl("static/img/details-button.svg")}
          onClick={onDetailsClick}
          style={{ cursor: "pointer" }}
        />
      </div>
    </div>
  );
};