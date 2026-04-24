import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  Pressable,
  PermissionsAndroid,
  Platform,
  NativeModules,
  NativeEventEmitter,
  Alert,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import LiveAudioStream from 'react-native-live-audio-stream';
import Slider from '@react-native-community/slider';
import { RealtimeClient } from './services/realtimeService';
import { carTools, executeCarTool } from './tools/carTools';
import {
  calculateEPASpeed,
  calculateBatteryConsumption,
  EPA_CYCLE_DURATION,
} from './utils/epaSimulator';
import Statistics from './components/Statistics';

const { PcmPlayer, MicService } = NativeModules;

const DEFAULT_SESSION_CONFIG = {
  modalities: ['text', 'audio'],
  instructions:
    'You are a helpful car assistant, use simple and short oral response.',
  voice: 'alloy',
  input_audio_format: 'pcm16',
  output_audio_format: 'pcm16',
  turn_detection: {
    type: 'server_vad',
    threshold: 0.5,
    prefix_padding_ms: 300,
    silence_duration_ms: 500,
  },
  input_audio_echo_cancellation: { type: 'server_echo_cancellation' },
  input_audio_noise_reduction: { type: 'azure_deep_noise_suppression' },
  input_audio_transcription: { model: 'whisper-1' },
  tools: carTools,
};

export default function App() {
  const [isConnected, setIsConnected] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [logs, setLogs] = useState([]);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showConfig, setShowConfig] = useState(true);

  const [config, setConfig] = useState({
    endpoint: '',
    apiKey: '',
    apiVersion: '2025-10-01',
    modelCategory: 'LLM Realtime',
    model: 'gpt-realtime',
    sessionConfig: DEFAULT_SESSION_CONFIG,
  });

  const [carStatus, setCarStatus] = useState({
    speed: 0,
    battery: 80,
    batteryRange: 245,
    temperature: 22,
    lights: 'off',
    windows: 'closed',
    music: 'off',
    radioStation: 'FM 101.5',
    radioPlaying: true,
    mediaType: 'radio',
    mediaVolume: 70,
    navigationActive: false,
    navigationDestination: 'Not set',
    navigationDistance: '—',
  });

  const [metrics, setMetrics] = useState({
    tokens: {
      input_text: 0,
      input_audio: 0,
      output_text: 0,
      output_audio: 0,
      cached_text: 0,
      cached_audio: 0,
    },
    latency: { values: [], min: 0, avg: 0, max: 0, p90: 0 },
    turns: 0,
  });

  const clientRef = useRef(null);
  const speechStartTimeRef = useRef(null);
  const firstAudioReceivedRef = useRef(false);
  const audioSubRef = useRef(null);
  const logsScrollRef = useRef(null);
  const carStatusRef = useRef(carStatus);
  const audioChunkCountRef = useRef(0);

  useEffect(() => {
    carStatusRef.current = carStatus;
  }, [carStatus]);

  useEffect(() => {
    setShowConfig(!isConnected);
  }, [isConnected]);

  useEffect(() => {
    (async () => {
      try {
        const ep = await AsyncStorage.getItem('azure_endpoint');
        const ak = await AsyncStorage.getItem('azure_apiKey');
        if (ep || ak) {
          setConfig(c => ({
            ...c,
            endpoint: ep || '',
            apiKey: ak || '',
          }));
        }
      } catch (_) {}
    })();
  }, []);

  useEffect(() => {
    if (config.endpoint) AsyncStorage.setItem('azure_endpoint', config.endpoint);
    if (config.apiKey) AsyncStorage.setItem('azure_apiKey', config.apiKey);
  }, [config.endpoint, config.apiKey]);

  useEffect(() => {
    const epaInterval = setInterval(() => {
      setCarStatus(prev => {
        const time = Date.now() / 1000;
        const cyclePosition = time % EPA_CYCLE_DURATION;
        const newSpeed = calculateEPASpeed(cyclePosition);
        const consumption = calculateBatteryConsumption(newSpeed);
        const newBattery = Math.max(0, prev.battery - consumption);
        const newRange = Math.round(newBattery * 3.1);
        return {
          ...prev,
          speed: newSpeed,
          battery: Math.round(newBattery * 100) / 100,
          batteryRange: newRange,
        };
      });
    }, 1000);
    return () => clearInterval(epaInterval);
  }, []);

  const addLog = (message, type = 'info') => {
    setLogs(prev => [
      ...prev.slice(-200),
      { time: new Date().toLocaleTimeString(), message, type },
    ]);
    setTimeout(() => {
      logsScrollRef.current?.scrollToEnd({ animated: true });
    }, 50);
  };

  const requestMicPermission = async () => {
    if (Platform.OS !== 'android') return true;
    const already = await PermissionsAndroid.check(
      PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
    );
    if (already) return true;
    const granted = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
      {
        title: 'Microphone permission',
        message: 'This app needs access to your microphone for voice chat.',
        buttonPositive: 'OK',
      },
    );
    return granted === PermissionsAndroid.RESULTS.GRANTED;
  };

  const audioInitRef = useRef(false);

  const startRecording = async () => {
    const ok = await requestMicPermission();
    if (!ok) {
      addLog('❌ Microphone permission denied', 'error');
      return;
    }
    try {
      try {
        MicService?.start?.();
      } catch (_) {}
      if (!audioInitRef.current) {
        LiveAudioStream.init({
          sampleRate: 24000,
          channels: 1,
          bitsPerSample: 16,
          audioSource: 7,
          bufferSize: 4096,
        });
        audioInitRef.current = true;
      }
      if (audioSubRef.current) {
        audioSubRef.current.remove();
        audioSubRef.current = null;
      }
      audioChunkCountRef.current = 0;
      audioSubRef.current = LiveAudioStream.on('data', data => {
        audioChunkCountRef.current += 1;
        if (clientRef.current && clientRef.current.isOpen()) {
          clientRef.current.send({
            type: 'input_audio_buffer.append',
            audio: data,
          });
        } else if (audioChunkCountRef.current === 1) {
          addLog('⚠️ WebSocket not open — audio chunks discarded', 'error');
        }
      });
      LiveAudioStream.start();
      setIsRecording(true);
      addLog('🎤 Recording started');
    } catch (e) {
      addLog(`❌ Failed to start recording: ${e.message}`, 'error');
    }
  };

  const stopRecording = () => {
    try {
      LiveAudioStream.stop();
    } catch (_) {}
    try {
      MicService?.stop?.();
    } catch (_) {}
    if (audioSubRef.current) {
      audioSubRef.current.remove();
      audioSubRef.current = null;
    }
    setIsRecording(false);
    addLog('🎤 Recording stopped');
  };

  const clearAudioQueue = () => {
    try {
      PcmPlayer?.stop();
    } catch (_) {}
  };

  const playAudio = base64Audio => {
    try {
      PcmPlayer?.write(base64Audio);
    } catch (e) {
      console.warn('playAudio error', e);
    }
  };

  const handleConnect = async () => {
    if (isConnected) {
      stopRecording();
      clearAudioQueue();
      clientRef.current?.disconnect();
      setIsConnected(false);
      addLog('Disconnected');
      return;
    }
    if (!config.endpoint || !config.apiKey) {
      Alert.alert(
        'Missing credentials',
        'Please provide Endpoint and API Key. You can create a key at ai.azure.com.',
      );
      return;
    }
    try {
      clientRef.current = new RealtimeClient(config);
      clientRef.current.on('open', () => {
        setIsConnected(true);
        addLog('Connected to Azure Voice Live');
      });
      clientRef.current.on('error', err => {
        addLog(`Error: ${err?.message || 'ws error'}`, 'error');
        setIsConnected(false);
      });
      clientRef.current.on('close', () => {
        setIsConnected(false);
        stopRecording();
        clearAudioQueue();
        addLog('Connection closed');
      });
      clientRef.current.on('message', async event => {
        if (
          event.type === 'session.updated' ||
          event.type === 'session.created'
        ) {
          addLog('✅ Session ready');
        }
        if (event.type === 'input_audio_buffer.speech_started') {
          clearAudioQueue();
          addLog('🎤 Speech started');
        }
        if (event.type === 'input_audio_buffer.speech_stopped') {
          speechStartTimeRef.current = Date.now();
          firstAudioReceivedRef.current = false;
          addLog('🎤 Speech stopped');
        }
        if (event.type === 'input_audio_buffer.committed') {
          addLog('📝 Audio committed');
        }
        if (
          event.type === 'conversation.item.input_audio_transcription.completed'
        ) {
          addLog(`👤 You: ${event.transcript}`, 'user');
        }
        if (event.type === 'response.created') {
          addLog('🤖 Assistant responding...');
        }
        if (event.type === 'response.text.done') {
          addLog(`🤖 Assistant: ${event.text}`, 'assistant');
        }
        if (event.type === 'response.audio_transcript.done') {
          if (event.transcript)
            addLog(`🤖 Assistant: ${event.transcript}`, 'assistant');
        }
        if (event.type === 'response.audio.delta') {
          if (event.delta) {
            if (!firstAudioReceivedRef.current && speechStartTimeRef.current) {
              const latency = Date.now() - speechStartTimeRef.current;
              firstAudioReceivedRef.current = true;
              setMetrics(prev => {
                const newLatencies = [...prev.latency.values, latency];
                const sorted = [...newLatencies].sort((a, b) => a - b);
                const p90Index = Math.ceil(sorted.length * 0.9) - 1;
                return {
                  ...prev,
                  latency: {
                    values: newLatencies,
                    min: Math.min(...newLatencies),
                    avg: Math.round(
                      newLatencies.reduce((a, b) => a + b, 0) /
                        newLatencies.length,
                    ),
                    max: Math.max(...newLatencies),
                    p90: sorted[p90Index] || 0,
                  },
                };
              });
            }
            playAudio(event.delta);
          }
        }
        if (event.type === 'response.audio.done') {
          addLog('🔊 Audio playback complete');
        }
        if (event.type === 'conversation.item.created') {
          if (event.item && event.item.type === 'function_call') {
            addLog(`🔧 Function call: ${event.item.name}`, 'tool');
          }
        }
        if (event.type === 'response.function_call_arguments.done') {
          const { name, arguments: args, call_id } = event;
          addLog(`🔧 Executing: ${name}(${args})`, 'tool');
          try {
            const result = await executeCarTool(
              name,
              JSON.parse(args),
              setCarStatus,
              carStatusRef.current,
            );
            addLog(`✅ Result: ${JSON.stringify(result)}`, 'tool');
            clientRef.current.sendToolOutput(call_id, result);
          } catch (e) {
            addLog(`❌ Tool error: ${e.message}`, 'error');
          }
        }
        if (event.type === 'response.done') {
          if (event.response && event.response.usage) {
            const usage = event.response.usage;
            const inputText = usage.input_tokens || 0;
            const inputAudio = usage.input_token_details?.audio_tokens || 0;
            const outputText = usage.output_token_details?.text_tokens || 0;
            const outputAudio = usage.output_token_details?.audio_tokens || 0;
            const cachedText = usage.input_token_details?.cached_tokens || 0;
            const cachedAudio =
              usage.input_token_details?.cached_audio_tokens || 0;
            setMetrics(prev => ({
              ...prev,
              tokens: {
                input_text: prev.tokens.input_text + inputText,
                input_audio: prev.tokens.input_audio + inputAudio,
                output_text: prev.tokens.output_text + outputText,
                output_audio: prev.tokens.output_audio + outputAudio,
                cached_text: prev.tokens.cached_text + cachedText,
                cached_audio: prev.tokens.cached_audio + cachedAudio,
              },
              turns: prev.turns + 1,
            }));
          }
          addLog('✅ Response complete');
        }
        if (event.type === 'error') {
          addLog(`❌ Error: ${event.error?.message || 'Unknown'}`, 'error');
        }
      });

      clientRef.current.setTools(carTools);
      await clientRef.current.connect();
    } catch (e) {
      addLog(`Connection failed: ${e.message}`, 'error');
      setIsConnected(false);
    }
  };

  const handleReset = () => {
    if (isConnected) {
      stopRecording();
      clearAudioQueue();
      clientRef.current?.disconnect();
      setIsConnected(false);
    }
    setLogs([]);
    setMetrics({
      tokens: {
        input_text: 0,
        input_audio: 0,
        output_text: 0,
        output_audio: 0,
        cached_text: 0,
        cached_audio: 0,
      },
      latency: { values: [], min: 0, avg: 0, max: 0, p90: 0 },
      turns: 0,
    });
    addLog('🔄 Reset complete');
  };

  const updateSession = patch => {
    setConfig(c => ({ ...c, sessionConfig: { ...c.sessionConfig, ...patch } }));
  };

  const voices =
    config.modelCategory === 'LLM Realtime'
      ? [
          { v: 'alloy', label: 'Alloy (OpenAI)' },
          { v: 'echo', label: 'Echo (OpenAI)' },
          { v: 'fable', label: 'Fable (OpenAI)' },
          { v: 'nova', label: 'Nova (OpenAI)' },
          { v: 'shimmer', label: 'Shimmer (OpenAI)' },
        ]
      : [
          { v: 'en-US-Ava:DragonHDLatestNeural', label: 'Ava HD (Female)' },
          { v: 'ja-JP-Nanami:DragonHDLatestNeural', label: 'Nanami HD (Female)' },
          {
            v: 'zh-CN-Xiaoxiao:DragonHDFlashLatestNeural',
            label: 'Xiaoxiao HD (Female)',
          },
          { v: 'en-US-AvaMultilingualNeural', label: 'Ava (Female)' },
          { v: 'en-US-AndrewMultilingualNeural', label: 'Andrew (Male)' },
          { v: 'en-US-GuyMultilingualNeural', label: 'Guy (Male)' },
        ];

  const modelOptions = {
    'LLM Realtime': ['gpt-realtime', 'gpt-realtime-mini'],
    'LLM+TTS': ['gpt-realtime', 'gpt-realtime-mini', 'phi4-mm-realtime'],
    'ASR+LLM+TTS': [
      'gpt-4o',
      'gpt-4o-mini',
      'gpt-4.1',
      'gpt-4.1-mini',
      'gpt-5',
      'gpt-5-mini',
      'gpt-5-nano',
      'gpt-5-chat',
      'phi4-mini',
    ],
  };

  const ChipSelect = ({ value, options, onChange, disabled }) => (
    <View style={styles.chipRow}>
      {options.map(opt => {
        const v = typeof opt === 'string' ? opt : opt.v;
        const label = typeof opt === 'string' ? opt : opt.label;
        const selected = v === value;
        return (
          <Pressable
            key={v}
            disabled={disabled}
            onPress={() => onChange(v)}
            style={[
              styles.chip,
              selected && styles.chipSelected,
              disabled && styles.chipDisabled,
            ]}
          >
            <Text
              style={[styles.chipText, selected && styles.chipTextSelected]}
            >
              {label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>🚗 Azure Voice Live — Car Assistant</Text>
        <Text
          style={[
            styles.statusPill,
            { color: isConnected ? '#4ade80' : '#9ca3af' },
          ]}
        >
          {isConnected ? '● Connected' : '● Disconnected'}
        </Text>
      </View>

      <View style={styles.body}>
        <ScrollView style={styles.sidebar} contentContainerStyle={{ padding: 12 }}>
          {/* Config panel */}
          <View style={styles.card}>
            <Pressable
              onPress={() => setShowConfig(v => !v)}
              style={styles.cardHeader}
            >
              <Text style={styles.cardTitle}>⚙️  Configuration</Text>
              <Text style={styles.chev}>{showConfig ? '▲' : '▼'}</Text>
            </Pressable>

            {showConfig && (
              <View style={{ gap: 10 }}>
                <Text style={styles.label}>Model Architecture</Text>
                <ChipSelect
                  value={config.modelCategory}
                  options={['LLM Realtime', 'LLM+TTS', 'ASR+LLM+TTS']}
                  disabled={isConnected}
                  onChange={category => {
                    let defaultModel = 'gpt-realtime';
                    let defaultVoice = 'alloy';
                    if (category === 'LLM+TTS') {
                      defaultVoice = 'zh-CN-Xiaoxiao:DragonHDFlashLatestNeural';
                    } else if (category === 'ASR+LLM+TTS') {
                      defaultModel = 'gpt-4o';
                      defaultVoice = 'zh-CN-Xiaoxiao:DragonHDFlashLatestNeural';
                    }
                    setConfig(c => ({
                      ...c,
                      modelCategory: category,
                      model: defaultModel,
                      sessionConfig: {
                        ...c.sessionConfig,
                        model: defaultModel,
                        voice: defaultVoice,
                      },
                    }));
                  }}
                />

                <Text style={styles.label}>Model</Text>
                <ChipSelect
                  value={config.model}
                  options={modelOptions[config.modelCategory]}
                  disabled={isConnected}
                  onChange={m =>
                    setConfig(c => ({
                      ...c,
                      model: m,
                      sessionConfig: { ...c.sessionConfig, model: m },
                    }))
                  }
                />

                <Text style={styles.label}>Voice</Text>
                <ChipSelect
                  value={config.sessionConfig.voice}
                  options={voices}
                  disabled={isConnected}
                  onChange={v => updateSession({ voice: v })}
                />

                <Text style={styles.label}>Endpoint</Text>
                <TextInput
                  value={config.endpoint}
                  editable={!isConnected}
                  onChangeText={t => setConfig(c => ({ ...c, endpoint: t }))}
                  placeholder="https://resource.services.ai.azure.com"
                  placeholderTextColor="#6b7280"
                  style={styles.input}
                  autoCapitalize="none"
                  autoCorrect={false}
                />

                <Text style={styles.label}>API Key</Text>
                <TextInput
                  value={config.apiKey}
                  editable={!isConnected}
                  onChangeText={t => setConfig(c => ({ ...c, apiKey: t }))}
                  secureTextEntry
                  style={styles.input}
                  autoCapitalize="none"
                  autoCorrect={false}
                />

                <Pressable
                  onPress={() => setShowAdvanced(v => !v)}
                  style={styles.advancedToggle}
                >
                  <Text style={styles.advancedText}>
                    Advanced Settings {showAdvanced ? '▲' : '▼'}
                  </Text>
                </Pressable>

                {showAdvanced && (
                  <View style={{ gap: 8 }}>
                    <Text style={styles.label}>Instructions</Text>
                    <TextInput
                      value={config.sessionConfig.instructions}
                      editable={!isConnected}
                      onChangeText={t => updateSession({ instructions: t })}
                      multiline
                      style={[styles.input, { height: 70 }]}
                    />
                    <Text style={styles.label}>
                      VAD Threshold ({config.sessionConfig.turn_detection?.threshold ?? 0.5})
                    </Text>
                    <Slider
                      value={config.sessionConfig.turn_detection?.threshold ?? 0.5}
                      minimumValue={0}
                      maximumValue={1}
                      step={0.05}
                      disabled={isConnected}
                      minimumTrackTintColor="#2563eb"
                      onValueChange={v =>
                        updateSession({
                          turn_detection: {
                            ...config.sessionConfig.turn_detection,
                            threshold: Math.round(v * 100) / 100,
                          },
                        })
                      }
                    />
                  </View>
                )}
              </View>
            )}

            <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
              <Pressable
                onPress={handleConnect}
                style={[
                  styles.connectBtn,
                  { backgroundColor: isConnected ? '#dc2626' : '#2563eb' },
                ]}
              >
                <Text style={styles.connectBtnText}>
                  {isConnected ? '■ Disconnect' : '▶ Connect'}
                </Text>
              </Pressable>
              <Pressable onPress={handleReset} style={styles.resetBtn}>
                <Text style={styles.resetBtnText}>↺</Text>
              </Pressable>
            </View>
          </View>

          {/* Vehicle Status */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>📟 Vehicle Status</Text>
            <View style={styles.statusGrid}>
              <View style={styles.statusCell}>
                <Text style={styles.statusLabel}>Speed</Text>
                <Text style={styles.statusValue}>{carStatus.speed}</Text>
                <Text style={styles.statusUnit}>km/h</Text>
              </View>
              <View style={styles.statusCell}>
                <Text style={styles.statusLabel}>Battery</Text>
                <Text style={styles.statusValue}>{carStatus.battery}%</Text>
                <Text style={styles.statusUnit}>{carStatus.batteryRange} km</Text>
              </View>
            </View>
            <View style={styles.statusGrid}>
              <View style={styles.statusCell}>
                <Text style={styles.statusLabel}>Lights</Text>
                <Text style={styles.statusValueSm}>{carStatus.lights}</Text>
              </View>
              <View style={styles.statusCell}>
                <Text style={styles.statusLabel}>Windows</Text>
                <Text style={styles.statusValueSm}>{carStatus.windows}</Text>
              </View>
            </View>

            <View style={styles.subPanel}>
              <Text style={styles.subPanelTitle}>🌡 CLIMATE</Text>
              <View style={styles.tempRow}>
                <Pressable
                  style={styles.tempBtn}
                  onPress={() =>
                    setCarStatus({
                      ...carStatus,
                      temperature: Math.max(16, carStatus.temperature - 1),
                    })
                  }
                >
                  <Text style={styles.tempBtnText}>−</Text>
                </Pressable>
                <Text style={styles.tempValue}>{carStatus.temperature}°C</Text>
                <Pressable
                  style={styles.tempBtn}
                  onPress={() =>
                    setCarStatus({
                      ...carStatus,
                      temperature: Math.min(30, carStatus.temperature + 1),
                    })
                  }
                >
                  <Text style={styles.tempBtnText}>+</Text>
                </Pressable>
              </View>
            </View>

            <View style={styles.subPanel}>
              <Text style={styles.subPanelTitle}>🎵 MEDIA</Text>
              <Text style={styles.mediaInfo}>
                {carStatus.mediaType === 'radio' && carStatus.radioStation}
                {carStatus.mediaType === 'music' && 'My Playlist'}
                {carStatus.mediaType === 'podcast' && 'Tech Talk #127'}
                {carStatus.mediaType === 'audiobook' && 'Digital Fortress'}
              </Text>
              <Text style={styles.statusLabel}>
                Volume {carStatus.mediaVolume}%
              </Text>
              <Slider
                value={carStatus.mediaVolume}
                minimumValue={0}
                maximumValue={100}
                step={1}
                minimumTrackTintColor="#2563eb"
                onValueChange={v =>
                  setCarStatus(cs => ({ ...cs, mediaVolume: Math.round(v) }))
                }
              />
            </View>

            <View style={styles.subPanel}>
              <Text style={styles.subPanelTitle}>🧭 NAVIGATION</Text>
              <Text style={styles.mediaInfo}>{carStatus.navigationDestination}</Text>
              <Text style={styles.statusUnit}>{carStatus.navigationDistance}</Text>
              <Pressable
                onPress={() =>
                  setCarStatus({
                    ...carStatus,
                    navigationActive: !carStatus.navigationActive,
                  })
                }
                style={[
                  styles.navBtn,
                  {
                    backgroundColor: carStatus.navigationActive
                      ? '#16a34a'
                      : '#4b5563',
                  },
                ]}
              >
                <Text style={styles.navBtnText}>
                  {carStatus.navigationActive ? 'Active' : 'Inactive'}
                </Text>
              </Pressable>
            </View>
          </View>
        </ScrollView>

        {/* Right pane */}
        <View style={styles.right}>
          <View style={styles.chatPanel}>
            <ScrollView
              ref={logsScrollRef}
              style={{ flex: 1 }}
              contentContainerStyle={{ padding: 10 }}
            >
              {logs.length === 0 && (
                <Text style={styles.emptyChat}>
                  No messages yet.{'\n'}Connect and start speaking…
                </Text>
              )}
              {logs.map((log, i) => (
                <View
                  key={i}
                  style={[
                    styles.logRow,
                    log.type === 'user' && styles.logUser,
                    log.type === 'assistant' && styles.logAssistant,
                    log.type === 'tool' && styles.logTool,
                    log.type === 'error' && styles.logError,
                  ]}
                >
                  <Text style={styles.logTime}>[{log.time}]</Text>
                  <Text
                    style={[
                      styles.logText,
                      log.type === 'user' && { color: '#93c5fd' },
                      log.type === 'assistant' && { color: '#86efac' },
                      log.type === 'tool' && { color: '#fde68a' },
                      log.type === 'error' && { color: '#fca5a5' },
                    ]}
                  >
                    {log.message}
                  </Text>
                </View>
              ))}
            </ScrollView>
            <View style={styles.micWrap}>
              <Pressable
                disabled={!isConnected}
                onPress={() => (isRecording ? stopRecording() : startRecording())}
                style={[
                  styles.micBtn,
                  {
                    backgroundColor: isRecording ? '#dc2626' : '#2563eb',
                    opacity: isConnected ? 1 : 0.5,
                  },
                ]}
              >
                <Text style={styles.micIcon}>{isRecording ? '■' : '🎤'}</Text>
              </Pressable>
            </View>
          </View>

          <Statistics metrics={metrics} config={config} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#111827' },
  header: {
    backgroundColor: '#1f2937',
    borderBottomWidth: 1,
    borderColor: '#374151',
    padding: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerTitle: { color: '#60a5fa', fontSize: 16, fontWeight: '700' },
  statusPill: { fontSize: 12, fontWeight: '600' },
  body: { flex: 1, flexDirection: 'row' },
  sidebar: { width: 320, backgroundColor: '#0f172a' },
  right: { flex: 1, padding: 12, gap: 12 },
  card: {
    backgroundColor: '#1f2937',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#374151',
    padding: 12,
    marginBottom: 12,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  cardTitle: { color: '#fff', fontSize: 14, fontWeight: '600' },
  chev: { color: '#9ca3af' },
  label: {
    color: '#9ca3af',
    fontSize: 11,
    fontWeight: '600',
  },
  input: {
    backgroundColor: '#374151',
    borderWidth: 1,
    borderColor: '#4b5563',
    borderRadius: 4,
    padding: 8,
    color: '#fff',
    fontSize: 12,
    fontFamily: Platform.select({ android: 'monospace' }),
  },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    backgroundColor: '#374151',
    borderWidth: 1,
    borderColor: '#4b5563',
  },
  chipSelected: { backgroundColor: '#2563eb', borderColor: '#3b82f6' },
  chipDisabled: { opacity: 0.5 },
  chipText: { color: '#d1d5db', fontSize: 11 },
  chipTextSelected: { color: '#fff', fontWeight: '600' },
  advancedToggle: { paddingVertical: 6 },
  advancedText: { color: '#9ca3af', fontSize: 11, fontWeight: '600' },
  connectBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 6,
    alignItems: 'center',
  },
  connectBtnText: { color: '#fff', fontWeight: '700' },
  resetBtn: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 6,
    backgroundColor: '#4b5563',
    alignItems: 'center',
  },
  resetBtnText: { color: '#fff', fontSize: 16 },
  statusGrid: { flexDirection: 'row', gap: 6, marginBottom: 6 },
  statusCell: {
    flex: 1,
    backgroundColor: '#374151',
    padding: 8,
    borderRadius: 4,
  },
  statusLabel: { color: '#9ca3af', fontSize: 10 },
  statusValue: { color: '#fff', fontSize: 18, fontWeight: '600' },
  statusValueSm: { color: '#fff', fontSize: 13, textTransform: 'capitalize' },
  statusUnit: { color: '#6b7280', fontSize: 10 },
  subPanel: {
    backgroundColor: '#374151',
    padding: 10,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#4b5563',
    marginTop: 8,
  },
  subPanelTitle: {
    color: '#9ca3af',
    fontSize: 10,
    fontWeight: '600',
    marginBottom: 6,
  },
  tempRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  tempBtn: {
    backgroundColor: '#4b5563',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 4,
  },
  tempBtnText: { color: '#fff', fontSize: 14 },
  tempValue: { color: '#fff', fontSize: 14, fontWeight: '600' },
  mediaInfo: { color: '#d1d5db', fontSize: 12, marginBottom: 4 },
  navBtn: {
    marginTop: 6,
    paddingVertical: 6,
    borderRadius: 4,
    alignItems: 'center',
  },
  navBtnText: { color: '#fff', fontSize: 11, fontWeight: '600' },
  chatPanel: {
    flex: 1,
    backgroundColor: '#1f2937',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#374151',
    overflow: 'hidden',
  },
  emptyChat: {
    color: '#6b7280',
    textAlign: 'center',
    marginTop: 30,
    fontSize: 12,
  },
  logRow: {
    flexDirection: 'row',
    padding: 4,
    gap: 6,
    borderRadius: 4,
    marginBottom: 2,
  },
  logUser: { backgroundColor: 'rgba(37,99,235,0.15)', borderLeftWidth: 2, borderLeftColor: '#3b82f6' },
  logAssistant: { backgroundColor: 'rgba(22,163,74,0.15)', borderLeftWidth: 2, borderLeftColor: '#22c55e' },
  logTool: { backgroundColor: 'rgba(234,179,8,0.15)', borderLeftWidth: 2, borderLeftColor: '#eab308' },
  logError: { backgroundColor: 'rgba(220,38,38,0.15)', borderLeftWidth: 2, borderLeftColor: '#ef4444' },
  logTime: { color: '#6b7280', fontSize: 10 },
  logText: { color: '#d1d5db', fontSize: 12, flex: 1 },
  micWrap: {
    borderTopWidth: 1,
    borderColor: '#374151',
    padding: 14,
    alignItems: 'center',
  },
  micBtn: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  micIcon: { color: '#fff', fontSize: 26 },
});
