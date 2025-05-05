import { NANO_KONTROL_KEYMAP } from "./constants";

document.addEventListener("DOMContentLoaded", initializeMidiController);

// FIXME: Marker forward/back sends multiple messages.
// We'll need to ignore / override this.
// 144, 84, 127
// 144, 84, 0
// 144, 92, 127
// 144, 92, 0
// 144, 84, 127
// 144, 84, 0

function getControlType(
  event: MIDIMessageEvent,
  keymap: Record<number, string>
):
  | [
      event?: MIDIMessageEvent,
      context?: string | number,
      type?: string,
      value?: number
    ]
  | undefined {
  const { data } = event;
  if (!data) return [event];
  const [status, channel, value] = data;

  switch (status) {
    case 144: // Button
      if (channel <= 23) {
        const trackIndex = channel % 8; // Determine the track index (0 to 7)
        const type = channel >= 16 ? "solo" : channel >= 8 ? "mute" : "record";
        return [event, keymap[trackIndex], type, value];
      }
      return [event, "Global", keymap[channel], value];

    case 176: // Knob
      return [event, keymap[channel], "knob", value];

    default:
      if (status >= 224 && status <= 231) {
        // Fader
        return [event, keymap[status], "fader", value];
      }
      return undefined;
  }
}

export async function initializeMidiController() {
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
        if (!event) return;
        console.log(getControlType(event, NANO_KONTROL_KEYMAP));
      };
    });
  } catch (error) {
    console.error("Error accessing MIDI devices:", error);
  }
}
