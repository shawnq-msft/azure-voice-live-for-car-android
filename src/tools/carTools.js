export const carTools = [
  {
    type: 'function',
    name: 'control_headlights',
    description: 'Turn headlights on or off',
    parameters: {
      type: 'object',
      properties: {
        state: {
          type: 'string',
          enum: ['on', 'off', 'auto'],
          description: 'Headlight state: on, off, or auto',
        },
      },
      required: ['state'],
    },
  },
  {
    type: 'function',
    name: 'control_windows',
    description: 'Open or close car windows',
    parameters: {
      type: 'object',
      properties: {
        position: {
          type: 'string',
          enum: ['all', 'driver', 'passenger', 'rear_left', 'rear_right'],
          description: 'Which window(s) to control',
        },
        action: {
          type: 'string',
          enum: ['open', 'close'],
          description: 'Open or close the window',
        },
      },
      required: ['position', 'action'],
    },
  },
  {
    type: 'function',
    name: 'set_temperature',
    description: 'Set cabin temperature in Celsius',
    parameters: {
      type: 'object',
      properties: {
        temperature: {
          type: 'number',
          description: 'Target temperature in Celsius (16-30)',
        },
      },
      required: ['temperature'],
    },
  },
  {
    type: 'function',
    name: 'play_radio',
    description: 'Play radio and optionally tune to a specific station',
    parameters: {
      type: 'object',
      properties: {
        station: {
          type: 'string',
          description: "Radio station (e.g., 'FM 101.5', 'AM 1020')",
        },
      },
      required: [],
    },
  },
  {
    type: 'function',
    name: 'play_music',
    description: 'Play music - either a specific song or playlist',
    parameters: {
      type: 'object',
      properties: {
        content: {
          type: 'string',
          description: 'Song name, artist, or playlist name',
        },
      },
      required: ['content'],
    },
  },
  {
    type: 'function',
    name: 'play_podcast',
    description: 'Play a specific podcast or podcast episode',
    parameters: {
      type: 'object',
      properties: {
        podcast: { type: 'string', description: 'Podcast name or episode' },
      },
      required: ['podcast'],
    },
  },
  {
    type: 'function',
    name: 'play_audiobook',
    description: 'Play a specific audiobook',
    parameters: {
      type: 'object',
      properties: {
        book: { type: 'string', description: 'Audiobook title or author' },
      },
      required: ['book'],
    },
  },
  {
    type: 'function',
    name: 'control_media_playback',
    description: 'Control current media playback (pause, resume, stop, next, previous)',
    parameters: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['play', 'pause', 'stop', 'next', 'previous'],
          description: 'Playback control action',
        },
      },
      required: ['action'],
    },
  },
  {
    type: 'function',
    name: 'set_media_volume',
    description: 'Set media volume level',
    parameters: {
      type: 'object',
      properties: {
        volume: { type: 'number', description: 'Volume level 0-100' },
      },
      required: ['volume'],
    },
  },
  {
    type: 'function',
    name: 'start_navigation',
    description: 'Start navigation to a destination',
    parameters: {
      type: 'object',
      properties: {
        destination: {
          type: 'string',
          description: 'Destination address or place name',
        },
      },
      required: ['destination'],
    },
  },
  {
    type: 'function',
    name: 'stop_navigation',
    description: 'Stop current navigation',
    parameters: { type: 'object', properties: {} },
  },
  {
    type: 'function',
    name: 'get_vehicle_status',
    description:
      'Get current vehicle status including speed, battery, lights, windows, etc.',
    parameters: { type: 'object', properties: {} },
  },
  {
    type: 'function',
    name: 'get_current_time',
    description: 'Get the current time',
    parameters: {
      type: 'object',
      properties: {
        timezone: {
          type: 'string',
          description: "Timezone: 'UTC' or 'local'",
        },
      },
      required: [],
    },
  },
  {
    type: 'function',
    name: 'get_weather',
    description: 'Get current weather for a location',
    parameters: {
      type: 'object',
      properties: {
        location: {
          type: 'string',
          description: "City and state, e.g., 'Seattle, WA'",
        },
        unit: {
          type: 'string',
          enum: ['celsius', 'fahrenheit'],
          description: 'Temperature unit',
        },
      },
      required: ['location'],
    },
  },
];

export const executeCarTool = async (name, args, setCarStatus, carStatus) => {
  if (name === 'control_headlights') {
    setCarStatus(prev => ({ ...prev, lights: args.state }));
    return { success: true, message: `Headlights turned ${args.state}` };
  }
  if (name === 'play_radio') {
    const station = args.station || 'FM 101.5';
    setCarStatus(prev => ({
      ...prev,
      mediaType: 'radio',
      radioStation: station,
      music: 'on',
    }));
    return { success: true, message: `Playing radio ${station}` };
  }
  if (name === 'play_music') {
    setCarStatus(prev => ({ ...prev, mediaType: 'music', music: 'on' }));
    return { success: true, message: `Playing music: ${args.content}` };
  }
  if (name === 'play_podcast') {
    setCarStatus(prev => ({ ...prev, mediaType: 'podcast', music: 'on' }));
    return { success: true, message: `Playing podcast: ${args.podcast}` };
  }
  if (name === 'play_audiobook') {
    setCarStatus(prev => ({ ...prev, mediaType: 'audiobook', music: 'on' }));
    return { success: true, message: `Playing audiobook: ${args.book}` };
  }
  if (name === 'control_media_playback') {
    const musicState =
      args.action === 'play'
        ? 'on'
        : args.action === 'pause' || args.action === 'stop'
        ? 'off'
        : 'on';
    setCarStatus(prev => ({ ...prev, music: musicState }));
    return { success: true, message: `Media ${args.action}` };
  }
  if (name === 'set_media_volume') {
    const volume = Math.max(0, Math.min(100, args.volume));
    setCarStatus(prev => ({ ...prev, mediaVolume: volume }));
    return { success: true, message: `Volume set to ${volume}%` };
  }
  if (name === 'control_windows') {
    const windowState = args.action === 'open' ? 'open' : 'closed';
    setCarStatus(prev => ({ ...prev, windows: windowState }));
    const windowLabel =
      args.position === 'all' ? 'All windows' : args.position + ' window';
    return { success: true, message: `${windowLabel} ${args.action}ed` };
  }
  if (name === 'set_temperature') {
    const temp = Math.max(16, Math.min(30, args.temperature));
    setCarStatus(prev => ({ ...prev, temperature: temp }));
    return { success: true, message: `Temperature set to ${temp}°C` };
  }
  if (name === 'start_navigation') {
    const distance = Math.floor(Math.random() * 50 + 5);
    setCarStatus(prev => ({
      ...prev,
      navigationActive: true,
      navigationDestination: args.destination,
      navigationDistance: `${distance} km`,
    }));
    return {
      success: true,
      message: `Navigation started to ${args.destination}, ${distance} km away`,
    };
  }
  if (name === 'stop_navigation') {
    setCarStatus(prev => ({
      ...prev,
      navigationActive: false,
      navigationDestination: 'Not set',
      navigationDistance: '—',
    }));
    return { success: true, message: 'Navigation stopped' };
  }
  if (name === 'get_vehicle_status') {
    return {
      success: true,
      message: 'Vehicle status retrieved',
      status: {
        speed: carStatus.speed,
        battery: carStatus.battery,
        batteryRange: carStatus.batteryRange,
        temperature: carStatus.temperature,
        lights: carStatus.lights,
        windows: carStatus.windows,
        music: carStatus.music,
        mediaType: carStatus.mediaType,
        mediaVolume: carStatus.mediaVolume,
        navigationActive: carStatus.navigationActive,
        navigationDestination: carStatus.navigationDestination,
        navigationDistance: carStatus.navigationDistance,
      },
    };
  }
  if (name === 'get_current_time') {
    const timezone = args.timezone || 'local';
    const now = new Date();
    const timeString =
      timezone.toLowerCase() === 'utc' ? now.toUTCString() : now.toLocaleString();
    return { time: timeString, timezone };
  }
  if (name === 'get_weather') {
    const location = args.location || 'Unknown';
    const unit = args.unit || 'celsius';
    return {
      location,
      temperature: unit === 'celsius' ? 22 : 72,
      unit,
      condition: 'Partly Cloudy',
      humidity: 65,
      wind_speed: 10,
    };
  }
  return { success: false, message: 'Unknown tool' };
};
