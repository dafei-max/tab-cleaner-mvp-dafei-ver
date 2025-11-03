import React, { useState } from "react";
import { Card } from "../screens/Card";
import { startSession, addCurrentTab, shareSession } from "../shared/api";

export const PopupApp = () => {
  const [status, setStatus] = useState("");

  const handleStart = async () => {
    try {
      const sessionId = await startSession();
      setStatus(`Session created: ${sessionId}`);
    } catch (error) {
      setStatus(`Error: ${error.message}`);
    }
  };

  const handleClean = async () => {
    try {
      await addCurrentTab();
      setStatus("Added tab");
    } catch (error) {
      setStatus(`Error: ${error.message}`);
    }
  };

  const handleDetails = async () => {
    try {
      const shareUrl = await shareSession();
      setStatus(`Share URL copied: ${shareUrl}`);
    } catch (error) {
      setStatus(`Error: ${error.message}`);
    }
  };

  return (
    <div>
      <Card
        onHomeClick={handleStart}
        onCleanClick={handleClean}
        onDetailsClick={handleDetails}
      />
      {status && (
        <p style={{ padding: "10px", textAlign: "center", fontSize: "12px" }}>
          {status}
        </p>
      )}
    </div>
  );
};
