import React, { useContext, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { SettingsContext, SettingsDispatchContext } from './Settings';
import { Permissions } from './Permissions';
import './Form.css';
import './LandingPage.css';

export function LandingPage () {
  const settings = useContext(SettingsContext);
  const dispatch = useContext(SettingsDispatchContext);
  const navigate = useNavigate();

  function joinRoom (e: React.FormEvent) {
    e.preventDefault();
    const room = settings.lastRoom;
    if (!room) {
      return;
    }
    console.log(room);
    navigate(`/${room}`);
  }

  return <div id="intro">
    <h1>Serendipity</h1>
    <p>
      When you want to talk to a colleague next to you, you don't DM them asking if they can join a Zoom call. You just look at them, notice if they're in the middle of something important, and then talk. Remote work lacks that serendipity, but there's no reason why it should. Everyone has a camera, a microphone, and an Internet connection. We could get the same experience using software. This project aims to do that.
    </p>
    <p>
      In Star Trek, when Picard wants to talk to engineering, he doesn't start a FaceTime call and wait for Geordi to pick up. That would be ridiculous. This project aims to implement a little bit of the past's sci-fi future. It's definitely a niche use case, but it's an important one, especially now that more people are working remotely.
    </p>

    <h2>How it works</h2>
    <p>
      Everyone who joins the same room sees a grayscale photo of each other that updates periodically. If anyone wants to chat with anyone else, they simply click on the image and video chat starts. There's no waiting for someone to answer the call. If this sounds crazy, well... that's how people interact in real life. The key is limiting access to people you trust: coworkers, friends, family, etc.
    </p>

    <form onSubmit={e => joinRoom(e)}>
      <Permissions />
      <fieldset>
        <legend>Join a room</legend>
        <label htmlFor="settings-name">Your name</label>
        <input type="text" name="name" id="settings-name" value={settings.name} onChange={e => dispatch({ type: "setName", value: e.target.value })} />
        <div className="break" />
        <label htmlFor="room-name">Room name</label>
        <input type="text" name="room" id="room-name" value={settings.lastRoom} onChange={e => dispatch({ type: "setRoom", value: e.target.value })} />
        <div className="break" />
        <div style={{ minWidth: 308, float: "right" }}>
          <button type="submit" disabled={!settings.name || !settings.lastRoom}>Join room</button>
        </div>
      </fieldset>
    </form>
  </div>;
}
