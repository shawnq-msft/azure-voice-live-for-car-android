import React from 'react';
import { View, Text, StyleSheet, Pressable, Linking } from 'react-native';

export default function Statistics({ metrics, config }) {
  const textCacheRate =
    metrics.tokens.input_text > 0
      ? ((metrics.tokens.cached_text / metrics.tokens.input_text) * 100).toFixed(1)
      : '0.0';
  const audioCacheRate =
    metrics.tokens.input_audio > 0
      ? (
          (metrics.tokens.cached_audio / metrics.tokens.input_audio) *
          100
        ).toFixed(1)
      : '0.0';

  const inputAudioSec = (metrics.tokens.input_audio / 10).toFixed(2);
  const outputAudioSec = (metrics.tokens.output_audio / 20).toFixed(2);

  const exportToCalculator = () => {
    const turns = metrics.turns || 1;
    const avgInputText = turns > 0 ? Math.round(metrics.tokens.input_text / turns) : 0;
    const avgOutputText = turns > 0 ? Math.round(metrics.tokens.output_text / turns) : 0;
    const avgInputAudioSec =
      turns > 0 ? (metrics.tokens.input_audio / 10 / turns).toFixed(2) : '0';
    const avgOutputAudioSec =
      turns > 0 ? (metrics.tokens.output_audio / 20 / turns).toFixed(2) : '0';

    const baseUrl = 'https://novaaidesigner.github.io/azure-voice-live-calculator/';
    const params = new URLSearchParams({
      dau: '1000',
      turns: String(turns),
      inputAudio: avgInputAudioSec,
      outputAudio: avgOutputAudioSec,
      inputText: String(avgInputText),
      model: config.model,
      avatar: 'none',
      textCache: textCacheRate,
      audioCache: audioCacheRate,
      tts: 'openai-realtime',
    });
    Linking.openURL(`${baseUrl}?${params.toString()}`);
  };

  const Cell = ({ label, value, color }) => (
    <View style={styles.cell}>
      <Text style={styles.cellLabel}>{label}</Text>
      <Text style={[styles.cellValue, color ? { color } : null]}>{value}</Text>
    </View>
  );

  return (
    <View style={styles.panel}>
      <View style={styles.header}>
        <Text style={styles.title}>📊 Statistics</Text>
        <Pressable style={styles.exportBtn} onPress={exportToCalculator}>
          <Text style={styles.exportBtnText}>Export to Calculator</Text>
        </Pressable>
      </View>

      <Text style={styles.sectionLabel}>Token Usage</Text>
      <View style={styles.row}>
        <Cell label="Input Text" value={`${metrics.tokens.input_text} tok`} />
        <Cell label="Text Cache" value={`${textCacheRate}%`} color="#facc15" />
        <Cell label="Output Text" value={`${metrics.tokens.output_text} tok`} />
      </View>
      <View style={styles.row}>
        <Cell
          label="Input Audio"
          value={`${metrics.tokens.input_audio} (${inputAudioSec}s)`}
        />
        <Cell label="Audio Cache" value={`${audioCacheRate}%`} color="#fb923c" />
        <Cell
          label="Output Audio"
          value={`${metrics.tokens.output_audio} (${outputAudioSec}s)`}
        />
      </View>

      <Text style={styles.sectionLabel}>Voice → Voice Latency (ms)</Text>
      <View style={styles.row}>
        <Cell label="Min" value={metrics.latency.min} />
        <Cell label="Avg" value={metrics.latency.avg} />
        <Cell label="Max" value={metrics.latency.max} />
        <Cell label="P90" value={metrics.latency.p90} />
      </View>

      <Text style={styles.turnCount}>
        Total Turns: <Text style={{ color: '#fff', fontWeight: '600' }}>{metrics.turns}</Text>
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    backgroundColor: '#1f2937',
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#374151',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  title: { color: '#fff', fontSize: 14, fontWeight: '600' },
  exportBtn: {
    backgroundColor: '#2563eb',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 4,
  },
  exportBtnText: { color: '#fff', fontSize: 11, fontWeight: '600' },
  sectionLabel: {
    color: '#9ca3af',
    fontSize: 11,
    fontWeight: '600',
    marginTop: 6,
    marginBottom: 4,
  },
  row: { flexDirection: 'row', gap: 6, marginBottom: 4 },
  cell: {
    flex: 1,
    backgroundColor: '#374151',
    padding: 6,
    borderRadius: 4,
  },
  cellLabel: { color: '#9ca3af', fontSize: 10 },
  cellValue: { color: '#fff', fontSize: 12, fontWeight: '600' },
  turnCount: { color: '#9ca3af', fontSize: 11, marginTop: 6 },
});
