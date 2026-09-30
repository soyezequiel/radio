/* PHYSICS is supplied by retro-physics.js and used by the numerical tests. */
class RetroReceiver extends AudioWorkletProcessor {
  constructor() {
    super();
    this.receiver = new PHYSICS.Receiver(sampleRate);
    this.frames = 0;
    this.port.onmessage = ({data}) => {
      if (data.type === 'tune') this.receiver.configure(data);
      if (data.type === 'carrier') this.receiver.setCarrier(data.slot, data.frequency, data.microvolts);
      if (data.type === 'remove') this.receiver.removeCarrier(data.slot);
    };
  }
  process(inputs, outputs) {
    this.receiver.process(inputs, outputs[0][0], outputs[0][1]);
    this.frames += outputs[0][0].length;
    if (this.frames >= sampleRate / 20) {
      this.port.postMessage(this.receiver.snapshot());
      this.frames = 0;
    }
    return true;
  }
}
registerProcessor('retro-receiver', RetroReceiver);
