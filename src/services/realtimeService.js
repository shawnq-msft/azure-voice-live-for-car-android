export class RealtimeClient {
  constructor(config) {
    this.config = config;
    this.ws = null;
    this.listeners = {};
  }

  on(event, cb) {
    if (!this.listeners[event]) this.listeners[event] = [];
    this.listeners[event].push(cb);
  }

  emit(event, data) {
    (this.listeners[event] || []).forEach(cb => cb(data));
  }

  async connect() {
    const { endpoint, apiKey, model, apiVersion, sessionConfig } = this.config;

    let url = endpoint;

    if (url.includes('services.ai.azure.com/api/projects/')) {
      const m = url.match(/https?:\/\/([^.]+)\.services\.ai\.azure\.com/);
      if (m) url = `https://${m[1]}.cognitiveservices.azure.com`;
    }

    if (url.startsWith('http://')) url = url.replace('http://', 'ws://');
    else if (url.startsWith('https://')) url = url.replace('https://', 'wss://');
    else if (!url.startsWith('wss://') && !url.startsWith('ws://'))
      url = `wss://${url}`;

    if (url.endsWith('/')) url = url.slice(0, -1);

    if (url.includes('openai.azure.com')) {
      if (!url.includes('/openai/realtime')) url = `${url}/openai/realtime`;
      const p = new URLSearchParams();
      if (!url.includes('api-version'))
        p.append('api-version', apiVersion || '2024-10-01-preview');
      if (!url.includes('deployment') && model) p.append('deployment', model);
      if (p.toString())
        url = `${url}${url.includes('?') ? '&' : '?'}${p.toString()}`;
    } else if (
      url.includes('services.ai.azure.com') ||
      url.includes('cognitiveservices.azure.com')
    ) {
      if (!url.includes('/voice-live/realtime'))
        url = `${url}/voice-live/realtime`;
      const p = new URLSearchParams();
      if (!url.includes('api-version'))
        p.append('api-version', apiVersion || '2025-10-01');
      if (!url.includes('model') && model) p.append('model', model);
      if (p.toString())
        url = `${url}${url.includes('?') ? '&' : '?'}${p.toString()}`;
    }

    if (apiKey && !url.includes('api-key')) {
      url = `${url}${url.includes('?') ? '&' : '?'}api-key=${apiKey}`;
    }

    this.ws = new WebSocket(url, 'realtime');

    this.ws.onopen = () => {
      this.emit('open');
      const openAIVoices = ['alloy', 'echo', 'fable', 'nova', 'shimmer'];
      const voiceValue = sessionConfig.voice;
      const formattedVoice = openAIVoices.includes(voiceValue)
        ? { name: voiceValue, type: 'openai' }
        : { name: voiceValue, type: 'azure-standard' };

      this.send({
        type: 'session.update',
        session: {
          ...sessionConfig,
          voice: formattedVoice,
          input_audio_format: 'pcm16',
          output_audio_format: 'pcm16',
        },
      });
    };

    this.ws.onmessage = e => {
      try {
        const data = JSON.parse(e.data);
        this.emit('message', data);
      } catch (err) {
        console.error('parse error', err);
      }
    };

    this.ws.onerror = err => this.emit('error', err);
    this.ws.onclose = () => this.emit('close');
  }

  send(data) {
    if (this.ws && this.ws.readyState === 1) {
      this.ws.send(JSON.stringify(data));
    }
  }

  isOpen() {
    return this.ws && this.ws.readyState === 1;
  }

  setTools(tools) {
    this.send({
      type: 'session.update',
      session: { tools, tool_choice: 'auto' },
    });
  }

  sendToolOutput(callId, output) {
    this.send({
      type: 'conversation.item.create',
      item: {
        type: 'function_call_output',
        call_id: callId,
        output: JSON.stringify(output),
      },
    });
    this.send({ type: 'response.create' });
  }

  disconnect() {
    if (this.ws) {
      try {
        this.ws.close();
      } catch (_) {}
      this.ws = null;
    }
  }
}
