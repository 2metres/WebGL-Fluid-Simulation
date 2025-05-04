document.addEventListener("DOMContentLoaded", initializeMidiController);

const controlTypes = {};

// FIXME: Marker forward/back sends multiple messages.
// We'll need to ignore / override this.
// 84, 127
// 84, 0
// 92, 127
// 92, 0
// 84, 127
// 84, 0

function getControlType(data: MIDIMessageEvent["data"]) {
  if (!data) return;

  const [status, channel, value] = data;

  switch (status) {
    case 144: // Button
      if (channel <= 23) {
        const trackIndex = channel % 8; // Determine the track index (0 to 7)
        const type = channel >= 16 ? "solo" : channel >= 8 ? "mute" : "record";
        console.log(keymap[trackIndex], type, value);
      }
      console.log("Global", keymap[channel], value);
      break;

    case 176: // Knob
      console.log(keymap[channel], "knob", value);
      break;

    default:
      if (status >= 224 && status <= 231) {
        // Fader
        console.log(keymap[status], "fader", value);
      }
      break;
      1;
  }
}

const keymap: Record<number, string> = {
  // Record
  0: "Track 1",
  1: "Track 2",
  2: "Track 3",
  3: "Track 4",
  4: "Track 5",
  5: "Track 6",
  6: "Track 7",
  7: "Track 8",
  // Mute
  8: "Track 1",
  9: "Track 2",
  10: "Track 3",
  11: "Track 4",
  12: "Track 5",
  13: "Track 6",
  14: "Track 7",
  15: "Track 8",
  // Solo
  16: "Track 1",
  17: "Track 2",
  18: "Track 3",
  19: "Track 4",
  20: "Track 5",
  21: "Track 6",
  22: "Track 7",
  23: "Track 8",
  // Faders
  224: "Track 1",
  225: "Track 2",
  226: "Track 3",
  227: "Track 4",
  228: "Track 5",
  229: "Track 6",
  230: "Track 7",
  231: "Track 8",

  46: "Track previous",
  47: "Track next",
  89: "cycle",

  91: "rewind",
  92: "fast-forward",
  93: "stop",
  94: "play",
  95: "record",

  144: "button",
  176: "knob",
};

async function initializeMidiController() {
  document.removeEventListener("DOMContentLoaded", initializeMidiController);

  if (!navigator.requestMIDIAccess) {
    console.error("Web MIDI API not supported in this browser.");
    return;
  }
  try {
    const midiAccess = await navigator.requestMIDIAccess();
    const inputs = midiAccess.inputs;
    const outputs = midiAccess.outputs;

    console.log("MIDI Inputs:", inputs);
    console.log(
      "MIDI Outputs:",
      outputs.forEach((output) => {
        console.log("Output:", output);
      })
    );

    inputs.forEach((input) => {
      input.onmidimessage = (event) => {
        if (!event.data) return;

        const data = event.data;

        getControlType(data);
        // console.log("MIDI Message:", data.map((d) => d).join(", "));
      };
    });
  } catch (error) {
    console.error("Error accessing MIDI devices:", error);
  }
}
