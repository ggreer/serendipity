// tone1, tone2, duration
type DTMFs = Array<[number, number, number]>;

export function playDTMF (dtmfs: DTMFs) {
  const context = new AudioContext();
  const gain = new GainNode(context, {
    gain: 0.35,
  });
  gain.connect(context.destination);

  const os1 = new OscillatorNode(context, {
    type: "triangle",
  });
  const os2 = new OscillatorNode(context, {
    type: "triangle",
  });
  os1.connect(gain);
  os2.connect(gain);

  let currentTime = 0;

  for (const [freq1, freq2, duration] of dtmfs) {
    os1.frequency.setValueAtTime(freq1, currentTime);
    os2.frequency.setValueAtTime(freq2, currentTime);
    currentTime += duration;
  }
  os1.start(0);
  os2.start(0);
  os1.stop(currentTime);
  os2.stop(currentTime);
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
