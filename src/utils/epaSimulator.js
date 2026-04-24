export const EPA_CYCLE_DURATION = 1369;

export const calculateEPASpeed = cyclePosition => {
  let speed;
  if (cyclePosition < 505) {
    const t = cyclePosition;
    if (t < 50) speed = Math.round((t / 50) * 60);
    else if (t < 80) speed = 60;
    else if (t < 130) speed = Math.round(60 + ((t - 80) / 50) * 30);
    else if (t < 160) speed = Math.round(90 - ((t - 130) / 30) * 60);
    else if (t < 200) speed = Math.round(30 + ((t - 160) / 40) * 20);
    else if (t < 320)
      speed = Math.round(Math.sin(((t - 200) / 120) * Math.PI) * 20 + 40);
    else if (t < 360) speed = 0;
    else if (t < 410) speed = Math.round(((t - 360) / 50) * 56.7);
    else speed = 56;
  } else {
    const t = cyclePosition - 505;
    if (t < 100) speed = Math.round((t / 100) * 75);
    else if (t < 200) speed = 75;
    else if (t < 300) speed = Math.round(75 - ((t - 200) / 100) * 75);
    else if (t < 320) speed = 0;
    else if (t < 420) speed = Math.round(((t - 320) / 100) * 60);
    else if (t < 500) speed = 60;
    else if (t < 620)
      speed = Math.round(
        Math.max(0, Math.sin(((t - 500) / 120) * Math.PI * 2) * 20 + 40),
      );
    else if (t < 700) speed = Math.round(((t - 620) / 80) * 56.7);
    else speed = 56;
  }
  return speed;
};

export const calculateBatteryConsumption = speed => {
  let consumption = 0.0005;
  if (speed > 0) consumption = 0.0001 + (speed / 100) * 0.003;
  return consumption;
};
