// tone1, tone2, duration
type DTMFs = Array<[number, number, number]>;

export function playDTMF (dtmfs: DTMFs) {
  console.log("playing");
  const context = new AudioContext();
  const gain = new GainNode(context, {
    gain: 0.3,
  });
  gain.connect(context.destination);

  let currentTime = 0;

  for (const [freq1, freq2, duration] of dtmfs) {
    const os1 = new OscillatorNode(context, {
      frequency: freq1,
      type: "sine",
    });
    const os2 = new OscillatorNode(context, {
      frequency: freq2,
      type: "sine",
    });
    os1.connect(gain);
    os2.connect(gain);
    os1.start(currentTime);
    os2.start(currentTime);
    os1.stop(currentTime + duration);
    os2.stop(currentTime + duration);
    currentTime += duration;
  }
}

export function playStartVideo () {
  playDTMF([
    [697, 1209, 0.08],
    [770, 1336, 0.08],
    [697, 1336, 0.08],
    [852, 1477, 0.08],
  ]);
}

export function playStopVideo () {
  playDTMF([
    [697, 1336, 0.08],
    [852, 1477, 0.08],
    [770, 1336, 0.08],
    [697, 1209, 0.08],
  ]);
}

export async function playTestSound () {
  playDTMF([
    [697, 1209, 0.1],
    [770, 1336, 0.1],
    [697, 1336, 0.1],
    [852, 1477, 0.1],
  ]);
  await new Promise<void>((resolve) => setTimeout(() => resolve(), 500));
  playDTMF([
    [697, 1336, 0.1],
    [852, 1477, 0.1],
    [770, 1336, 0.1],
    [697, 1209, 0.1],
  ]);
}
