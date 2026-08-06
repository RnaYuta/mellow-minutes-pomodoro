import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import {
  isPermissionGranted,
  requestPermission,
  sendNotification,
} from "@tauri-apps/plugin-notification";

const MAX_MINUTES = 60;
const DEFAULT_MINUTES = 25;
const DEFAULT_GAUGE_COLOR = "#ff796f";
const DEFAULT_CLOCK_COLOR = "#7cc2e0";
const DEFAULT_DIAL_COLOR = "#8fa3ad";
const COLOR_STORAGE_KEY = "mellow-minutes-colors";
const SIMPLE_MODE_STORAGE_KEY = "mellow-minutes-simple-mode";
const AUTO_CYCLE_STORAGE_KEY = "mellow-minutes-auto-cycle";
const STATS_STORAGE_KEY = "mellow-minutes-stats";
const TOGGLE_TIMER_EVENT = "toggle-timer";
const TOGGLE_SHORTCUT_LABEL = "⌘⇧M";
const COMPLETE_FLASH_MS = 3000;
const RESET_HOLD_MS = 650;

const SESSION_TYPES = {
  FOCUS: "focus",
  SHORT_BREAK: "short-break",
  LONG_BREAK: "long-break",
};

const BREAK_MINUTES = {
  [SESSION_TYPES.SHORT_BREAK]: 5,
  [SESSION_TYPES.LONG_BREAK]: 15,
};

const LONG_BREAK_INTERVAL = 4;

const SESSION_LABELS = {
  [SESSION_TYPES.FOCUS]: "집중",
  [SESSION_TYPES.SHORT_BREAK]: "짧은 휴식",
  [SESSION_TYPES.LONG_BREAK]: "긴 휴식",
};

const SESSION_TAGS = {
  [SESSION_TYPES.FOCUS]: "FOCUS TIME",
  [SESSION_TYPES.SHORT_BREAK]: "SHORT BREAK",
  [SESSION_TYPES.LONG_BREAK]: "LONG BREAK",
};

const SESSION_ICONS = {
  [SESSION_TYPES.FOCUS]: "🎯",
  [SESSION_TYPES.SHORT_BREAK]: "☕",
  [SESSION_TYPES.LONG_BREAK]: "🌿",
};

const dialNumbers = Array.from({ length: 12 }, (_, index) =>
  index === 0 ? 60 : index * 5,
);
const seededRandom = (seed) => {
  const value = Math.sin(seed * 12.9898) * 43758.5453;
  return value - Math.floor(value);
};
const confettiPieces = Array.from({ length: 120 }, (_, index) => ({
  left: 3 + seededRandom(index + 1) * 94,
  delay: -seededRandom(index + 71) * 6,
  duration: 3.4 + seededRandom(index + 141) * 3.2,
  drift: -62 + seededRandom(index + 211) * 124,
  rotation: seededRandom(index + 281) * 180,
  color: ((index * 11) ^ (index >> 1)) % 6,
}));
const confettiColors = [
  "var(--accent)",
  "var(--clock-color)",
  "color-mix(in srgb, var(--accent), white 48%)",
  "color-mix(in srgb, var(--clock-color), white 58%)",
  "color-mix(in srgb, var(--accent), var(--clock-color) 45%)",
  "color-mix(in srgb, var(--clock-color), black 22%)",
];
const fireworkBursts = [
  { x: 28, y: 25, delay: 0.2, cycle: 4.3 },
  { x: 74, y: 31, delay: 1.1, cycle: 5.7 },
  { x: 51, y: 17, delay: 2.0, cycle: 6.2 },
  { x: 22, y: 38, delay: 2.8, cycle: 4.9 },
  { x: 79, y: 23, delay: 3.4, cycle: 6.8 },
  { x: 46, y: 34, delay: 4.1, cycle: 5.3 },
  { x: 67, y: 16, delay: 4.8, cycle: 7.1 },
  { x: 17, y: 28, delay: 5.4, cycle: 5.9 },
  { x: 82, y: 39, delay: 6.0, cycle: 6.5 },
  { x: 52, y: 22, delay: 6.6, cycle: 4.7 },
];
const fireworkSparks = Array.from({ length: 12 }, (_, index) => index * 30);

function getSavedColors() {
  try {
    const savedColors = JSON.parse(localStorage.getItem(COLOR_STORAGE_KEY));
    return {
      gaugeColor: savedColors?.gaugeColor || DEFAULT_GAUGE_COLOR,
      clockColor: savedColors?.clockColor || DEFAULT_CLOCK_COLOR,
      dialColor: savedColors?.dialColor || DEFAULT_DIAL_COLOR,
      isDialColorEnabled: savedColors?.isDialColorEnabled === true,
    };
  } catch {
    return {
      gaugeColor: DEFAULT_GAUGE_COLOR,
      clockColor: DEFAULT_CLOCK_COLOR,
      dialColor: DEFAULT_DIAL_COLOR,
      isDialColorEnabled: false,
    };
  }
}

function getSavedSimpleMode() {
  const savedValue = localStorage.getItem(SIMPLE_MODE_STORAGE_KEY);
  return savedValue === null ? true : savedValue === "true";
}

function getSavedAutoCycle() {
  const savedValue = localStorage.getItem(AUTO_CYCLE_STORAGE_KEY);
  return savedValue === null ? true : savedValue === "true";
}

function getTodayKey() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function getSavedTodayCount() {
  try {
    const saved = JSON.parse(localStorage.getItem(STATS_STORAGE_KEY));
    if (saved?.date === getTodayKey()) return saved.count || 0;
  } catch {
    // ignore malformed storage
  }
  return 0;
}

function clampMinutes(value) {
  return Math.min(MAX_MINUTES, Math.max(1, Math.round(value)));
}

function formatTime(totalSeconds) {
  const minutes = Math.floor(totalSeconds / 60)
    .toString()
    .padStart(2, "0");
  const seconds = (totalSeconds % 60).toString().padStart(2, "0");
  return `${minutes}:${seconds}`;
}

function getPhaseMinutes(sessionType, focusMinutes) {
  return sessionType === SESSION_TYPES.FOCUS
    ? focusMinutes
    : BREAK_MINUTES[sessionType];
}

function getNextPhase(currentType, streak) {
  if (currentType === SESSION_TYPES.FOCUS) {
    const nextStreak = streak + 1;
    return nextStreak % LONG_BREAK_INTERVAL === 0
      ? { type: SESSION_TYPES.LONG_BREAK, streak: nextStreak }
      : { type: SESSION_TYPES.SHORT_BREAK, streak: nextStreak };
  }
  return { type: SESSION_TYPES.FOCUS, streak };
}

function playChime() {
  try {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;
    const context = new AudioContextClass();
    const now = context.currentTime;
    [660, 880].forEach((frequency, index) => {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = "sine";
      oscillator.frequency.value = frequency;
      const start = now + index * 0.14;
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(0.18, start + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.9);
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start(start);
      oscillator.stop(start + 1);
    });
    window.setTimeout(() => context.close(), 1400);
  } catch (error) {
    console.error("알림 소리를 재생하지 못했습니다.", error);
  }
}

/** Holding a button down for `holdMs` calls `onConfirm`; releasing early cancels. */
function useHoldToConfirm(onConfirm, holdMs = RESET_HOLD_MS) {
  const [progress, setProgress] = useState(0);
  const frameRef = useRef(null);
  const startRef = useRef(null);

  const clear = useCallback(() => {
    if (frameRef.current) cancelAnimationFrame(frameRef.current);
    frameRef.current = null;
    startRef.current = null;
    setProgress(0);
  }, []);

  const tick = useCallback(() => {
    if (startRef.current === null) return;
    const elapsed = performance.now() - startRef.current;
    const ratio = Math.min(1, elapsed / holdMs);
    setProgress(ratio);
    if (ratio >= 1) {
      clear();
      onConfirm();
      return;
    }
    frameRef.current = requestAnimationFrame(tick);
  }, [clear, holdMs, onConfirm]);

  const start = useCallback(
    (event) => {
      event.preventDefault();
      startRef.current = performance.now();
      frameRef.current = requestAnimationFrame(tick);
    },
    [tick],
  );

  useEffect(() => clear, [clear]);

  return {
    progress,
    handlers: {
      onPointerDown: start,
      onPointerUp: clear,
      onPointerLeave: clear,
      onPointerCancel: clear,
    },
  };
}

export default function App() {
  const isTauriApp = "__TAURI_INTERNALS__" in window;
  const [configuredMinutes, setConfiguredMinutes] = useState(DEFAULT_MINUTES);
  const [inputValue, setInputValue] = useState(String(DEFAULT_MINUTES));
  const [remainingSeconds, setRemainingSeconds] = useState(
    DEFAULT_MINUTES * 60,
  );
  const [isRunning, setIsRunning] = useState(false);
  const [isComplete, setIsComplete] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [colors, setColors] = useState(getSavedColors);
  const [isColorMenuOpen, setIsColorMenuOpen] = useState(false);
  const [isAlwaysOnTop, setIsAlwaysOnTop] = useState(true);
  const [isSimpleMode, setIsSimpleMode] = useState(getSavedSimpleMode);
  const [isAutoCycleEnabled, setIsAutoCycleEnabled] = useState(getSavedAutoCycle);
  const [celebrationRun, setCelebrationRun] = useState(0);
  const [isCelebrating, setIsCelebrating] = useState(false);
  const [phase, setPhaseState] = useState({
    type: SESSION_TYPES.FOCUS,
    streak: 0,
  });
  const [todayCount, setTodayCount] = useState(getSavedTodayCount);
  const endAtRef = useRef(null);
  const draggingRef = useRef(false);
  const colorMenuRef = useRef(null);
  const gaugeColorInputRef = useRef(null);
  const clockColorInputRef = useRef(null);
  const dialColorInputRef = useRef(null);
  const phaseRef = useRef(phase);
  const completeFlashTimeoutRef = useRef(null);
  const toggleTimerRef = useRef(() => {});

  const setPhase = useCallback((updater) => {
    const next = typeof updater === "function" ? updater(phaseRef.current) : updater;
    phaseRef.current = next;
    setPhaseState(next);
  }, []);

  const playCelebration = useCallback(() => {
    setCelebrationRun((run) => run + 1);
    setIsCelebrating(true);
  }, []);

  const flashComplete = useCallback(() => {
    setIsComplete(true);
    if (completeFlashTimeoutRef.current) {
      window.clearTimeout(completeFlashTimeoutRef.current);
    }
    completeFlashTimeoutRef.current = window.setTimeout(() => {
      setIsComplete(false);
      setIsCelebrating(false);
    }, COMPLETE_FLASH_MS);
  }, []);

  const notifyPhaseComplete = useCallback(
    async (completedType, nextType) => {
      const title =
        completedType === SESSION_TYPES.FOCUS
          ? "집중 시간이 끝났어요"
          : "휴식이 끝났어요";
      const body =
        nextType === SESSION_TYPES.FOCUS
          ? "다시 집중할 시간이에요."
          : nextType === SESSION_TYPES.LONG_BREAK
            ? "긴 휴식을 시작해요."
            : "짧은 휴식을 시작해요.";

      if (isTauriApp) {
        try {
          let granted = await isPermissionGranted();
          if (!granted) granted = (await requestPermission()) === "granted";
          if (granted) sendNotification({ title, body });
        } catch (error) {
          console.error("알림을 보내지 못했습니다.", error);
        }
        return;
      }

      if (typeof Notification === "undefined") return;
      try {
        if (Notification.permission === "default") {
          await Notification.requestPermission();
        }
        if (Notification.permission === "granted") {
          new Notification(title, { body });
        }
      } catch (error) {
        console.error("알림을 보내지 못했습니다.", error);
      }
    },
    [isTauriApp],
  );

  const applyMinutes = useCallback((nextValue) => {
    const nextMinutes = clampMinutes(nextValue);
    setConfiguredMinutes(nextMinutes);
    setInputValue(String(nextMinutes));
    setRemainingSeconds(nextMinutes * 60);
    setIsRunning(false);
    setIsComplete(false);
    endAtRef.current = null;
  }, []);

  useEffect(() => {
    if (!isRunning) return undefined;

    endAtRef.current = Date.now() + remainingSeconds * 1000;
    const updateTimer = () => {
      if (!endAtRef.current) return;
      const nextSeconds = Math.max(
        0,
        Math.ceil((endAtRef.current - Date.now()) / 1000),
      );
      setRemainingSeconds(nextSeconds);
      if (nextSeconds !== 0) return;

      const completedPhase = phaseRef.current;
      const next = isAutoCycleEnabled
        ? getNextPhase(completedPhase.type, completedPhase.streak)
        : { type: SESSION_TYPES.FOCUS, streak: 0 };
      const nextSecondsForPhase = getPhaseMinutes(
        next.type,
        configuredMinutes,
      ) * 60;

      setPhase(next);
      setRemainingSeconds(nextSecondsForPhase);
      if (isAutoCycleEnabled) {
        endAtRef.current = Date.now() + nextSecondsForPhase * 1000;
      } else {
        endAtRef.current = null;
        setIsRunning(false);
      }

      playChime();
      notifyPhaseComplete(completedPhase.type, next.type);
      flashComplete();
      if (completedPhase.type === SESSION_TYPES.FOCUS) {
        setTodayCount((count) => count + 1);
        playCelebration();
      }
    };

    updateTimer();
    const timerId = window.setInterval(updateTimer, 200);
    return () => window.clearInterval(timerId);
  }, [
    isRunning,
    configuredMinutes,
    isAutoCycleEnabled,
    playCelebration,
    flashComplete,
    notifyPhaseComplete,
    setPhase,
  ]);

  useEffect(() => {
    localStorage.setItem(COLOR_STORAGE_KEY, JSON.stringify(colors));
  }, [colors]);

  useEffect(() => {
    localStorage.setItem(
      STATS_STORAGE_KEY,
      JSON.stringify({ date: getTodayKey(), count: todayCount }),
    );
  }, [todayCount]);

  useEffect(() => {
    localStorage.setItem(SIMPLE_MODE_STORAGE_KEY, String(isSimpleMode));
    if (!isTauriApp) return;

    invoke("set_simple_mode", { enabled: isSimpleMode }).catch((error) => {
      console.error("Simple 모드 창 크기를 적용하지 못했습니다.", error);
    });
  }, [isSimpleMode, isTauriApp]);

  useEffect(() => {
    localStorage.setItem(AUTO_CYCLE_STORAGE_KEY, String(isAutoCycleEnabled));
  }, [isAutoCycleEnabled]);

  useEffect(() => {
    if (!isTauriApp) return undefined;

    const syncAlwaysOnTop = async () => {
      try {
        setIsAlwaysOnTop(await invoke("is_always_on_top"));
      } catch (error) {
        console.error("창 고정 상태를 확인하지 못했습니다.", error);
      }
    };

    syncAlwaysOnTop();
    window.addEventListener("focus", syncAlwaysOnTop);
    return () => window.removeEventListener("focus", syncAlwaysOnTop);
  }, [isTauriApp]);

  // Mirror the countdown onto the menu bar tray icon.
  useEffect(() => {
    if (!isTauriApp) return;
    const phaseSeconds = getPhaseMinutes(phase.type, configuredMinutes) * 60;
    const isIdle = !isRunning && remainingSeconds === phaseSeconds;
    const title = isIdle
      ? ""
      : `${SESSION_ICONS[phase.type]} ${formatTime(remainingSeconds)}`;
    invoke("set_tray_title", { title }).catch((error) => {
      console.error("메뉴바 타이틀을 갱신하지 못했습니다.", error);
    });
  }, [isTauriApp, isRunning, remainingSeconds, phase.type, configuredMinutes]);

  // Global shortcut relay: Rust emits this event when the hotkey fires.
  useEffect(() => {
    if (!isTauriApp) return undefined;
    let disposed = false;
    let unlisten;
    listen(TOGGLE_TIMER_EVENT, () => toggleTimerRef.current())
      .then((fn) => {
        if (disposed) fn();
        else unlisten = fn;
      })
      .catch((error) => {
        console.error("전역 단축키 이벤트를 구독하지 못했습니다.", error);
      });
    return () => {
      disposed = true;
      if (unlisten) unlisten();
    };
  }, [isTauriApp]);

  useEffect(() => {
    if (!isColorMenuOpen) return undefined;

    const closeMenu = (event) => {
      if (
        event.type === "keydown" &&
        event.key !== "Escape"
      ) return;
      if (
        event.type === "pointerdown" &&
        colorMenuRef.current?.contains(event.target)
      ) return;
      setIsColorMenuOpen(false);
    };

    document.addEventListener("pointerdown", closeMenu);
    document.addEventListener("keydown", closeMenu);
    return () => {
      document.removeEventListener("pointerdown", closeMenu);
      document.removeEventListener("keydown", closeMenu);
    };
  }, [isColorMenuOpen]);

  const updateColor = (colorName, value) => {
    setColors((currentColors) => ({
      ...currentColors,
      [colorName]: value,
    }));
  };

  const toggleAlwaysOnTop = async () => {
    const nextValue = !isAlwaysOnTop;
    setIsAlwaysOnTop(nextValue);
    try {
      await invoke("set_always_on_top", { enabled: nextValue });
    } catch (error) {
      setIsAlwaysOnTop(!nextValue);
      console.error("항상 위 설정을 변경하지 못했습니다.", error);
    }
  };

  const toggleSimpleMode = () => {
    setIsColorMenuOpen(false);
    setIsSimpleMode((enabled) => !enabled);
  };

  const toggleAutoCycle = () => {
    setIsAutoCycleEnabled((enabled) => !enabled);
  };

  const phaseSeconds = getPhaseMinutes(phase.type, configuredMinutes) * 60;
  const isFreshFocusIdle =
    phase.type === SESSION_TYPES.FOCUS &&
    !isRunning &&
    remainingSeconds === configuredMinutes * 60;
  const isDialLocked = !isFreshFocusIdle;

  const setTimeFromPoint = useCallback(
    (event) => {
      if (isDialLocked) return;
      const rect = event.currentTarget.getBoundingClientRect();
      const radians = Math.atan2(
        event.clientY - (rect.top + rect.height / 2),
        event.clientX - (rect.left + rect.width / 2),
      );
      const clockwiseDegrees = (radians * (180 / Math.PI) + 90 + 360) % 360;
      applyMinutes(Math.round(clockwiseDegrees / 6) || MAX_MINUTES);
    },
    [applyMinutes, isDialLocked],
  );

  const handlePointerDown = (event) => {
    if (isDialLocked) return;
    draggingRef.current = true;
    setIsDragging(true);
    event.currentTarget.setPointerCapture(event.pointerId);
    setTimeFromPoint(event);
  };

  const handlePointerMove = (event) => {
    if (draggingRef.current) setTimeFromPoint(event);
  };

  const finishDrag = (event) => {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    setIsDragging(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const handleDialKeyDown = (event) => {
    if (isDialLocked) return;
    if (event.key === "ArrowUp" || event.key === "ArrowRight") {
      event.preventDefault();
      applyMinutes(configuredMinutes + 1);
    } else if (event.key === "ArrowDown" || event.key === "ArrowLeft") {
      event.preventDefault();
      applyMinutes(configuredMinutes - 1);
    } else if (event.key === "Home") {
      event.preventDefault();
      applyMinutes(1);
    } else if (event.key === "End") {
      event.preventDefault();
      applyMinutes(MAX_MINUTES);
    }
  };

  const handleInputChange = (value) => {
    setInputValue(value);
    if (value === "") return;
    const numericValue = Number(value);
    if (Number.isFinite(numericValue)) applyMinutes(numericValue);
  };

  const normalizeInput = () => {
    const numericValue = Number(inputValue);
    if (!inputValue || !Number.isFinite(numericValue)) {
      setInputValue(String(configuredMinutes));
      return;
    }
    applyMinutes(numericValue);
  };

  const toggleTimer = useCallback(() => {
    if (isRunning) {
      setIsRunning(false);
      endAtRef.current = null;
      return;
    }
    if (remainingSeconds <= 0) return;
    setIsComplete(false);
    setIsCelebrating(false);
    setIsRunning(true);
    if (isTauriApp) {
      isPermissionGranted().then((granted) => {
        if (!granted) requestPermission();
      });
    } else if (typeof Notification !== "undefined" && Notification.permission === "default") {
      Notification.requestPermission();
    }
  }, [isRunning, remainingSeconds, isTauriApp]);

  useEffect(() => {
    toggleTimerRef.current = toggleTimer;
  }, [toggleTimer]);

  const resetTimer = useCallback(() => {
    setIsRunning(false);
    setIsComplete(false);
    setIsCelebrating(false);
    setPhase({ type: SESSION_TYPES.FOCUS, streak: 0 });
    setRemainingSeconds(configuredMinutes * 60);
    endAtRef.current = null;
  }, [configuredMinutes, setPhase]);

  const { progress: resetHoldProgress, handlers: resetHoldHandlers } =
    useHoldToConfirm(resetTimer, RESET_HOLD_MS);

  const progressDegrees = (remainingSeconds / (MAX_MINUTES * 60)) * 360;
  const isStartDisabled = !isRunning && remainingSeconds <= 0;
  const isPaused = remainingSeconds < phaseSeconds && remainingSeconds > 0;
  const phaseLabel = SESSION_LABELS[phase.type];
  const phaseIcon = SESSION_ICONS[phase.type];
  const statusCopy = isComplete
    ? phase.type === SESSION_TYPES.FOCUS
      ? "좋아요! 다시 집중을 시작해요."
      : "집중 시간이 끝났어요. 잠시 쉬어가요."
    : isRunning
      ? phase.type === SESSION_TYPES.FOCUS
        ? "지금 이 순간에만 집중해요."
        : "충분히 쉬어가요."
      : isPaused
        ? "잠시 멈췄어요. 준비되면 이어가세요."
        : "다이얼을 돌려 집중 시간을 정해보세요.";
  const primaryLabel = isRunning
    ? "일시정지"
    : isStartDisabled
      ? "시간 설정 필요"
      : isPaused
        ? "계속하기"
        : phase.type === SESSION_TYPES.FOCUS
          ? "집중 시작"
          : "휴식 시작";

  const resetFillStyle = useMemo(
    () => ({ "--hold-progress": resetHoldProgress }),
    [resetHoldProgress],
  );

  return (
    <main
      className={`page-shell ${isSimpleMode ? "is-simple" : ""} ${colors.isDialColorEnabled ? "is-dial-custom" : ""}`}
      style={{
        "--user-accent": colors.gaugeColor,
        "--user-clock-color": colors.clockColor,
        "--user-dial-color": colors.dialColor,
      }}
    >
      {import.meta.env.DEV && (
        <button
          className="celebration-test-button"
          type="button"
          onClick={playCelebration}
        >
          종료 효과 테스트
        </button>
      )}
      <section className="timer-workspace" aria-labelledby="page-title">
        <header className="brand-row" data-tauri-drag-region>
          <div className="brand-copy" data-tauri-drag-region>
            <p className="eyebrow" data-tauri-drag-region>MELLOW MINUTES</p>
            <h1 id="page-title" data-tauri-drag-region>나만의 집중 타이머</h1>
            <p className="phase-status" data-tauri-drag-region>
              <span className="phase-tag">{phaseIcon} {phaseLabel}</span>
              <span aria-hidden="true"> · </span>
              <span>오늘 {todayCount}번 완료</span>
            </p>
          </div>
        </header>

        <div className="header-actions">
            <div
              className={`status-lamp ${isComplete ? "is-lit" : ""}`}
              aria-label={isComplete ? "타이머 완료 알림 켜짐" : "타이머 대기 중"}
            >
              <span />
            </div>
            <div className="color-menu-wrap" ref={colorMenuRef}>
              <button
                className="menu-toggle"
                type="button"
                aria-label="설정 열기"
                aria-expanded={isColorMenuOpen}
                aria-controls="color-menu"
                onClick={() => setIsColorMenuOpen((isOpen) => !isOpen)}
              >
                <span />
                <span />
                <span />
              </button>

              {isColorMenuOpen && (
                <div className="color-menu" id="color-menu">
                  <div className="color-menu-heading">
                    <div>
                      <strong>설정</strong>
                      <span>나만의 타이머를 만들어보세요</span>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        setColors({
                          gaugeColor: DEFAULT_GAUGE_COLOR,
                          clockColor: DEFAULT_CLOCK_COLOR,
                          dialColor: DEFAULT_DIAL_COLOR,
                          isDialColorEnabled: false,
                        })
                      }
                    >
                      초기화
                    </button>
                  </div>

                  <button
                    className="desktop-option simple-mode-option"
                    type="button"
                    role="switch"
                    aria-checked={isSimpleMode}
                    onClick={toggleSimpleMode}
                  >
                    <span className="pin-symbol" aria-hidden="true">◫</span>
                    <span>
                      <strong>Simple 모드</strong>
                      <small>작고 간결한 타이머로 표시해요</small>
                    </span>
                    <span className="toggle-track" aria-hidden="true">
                      <span />
                    </span>
                  </button>

                  <button
                    className="desktop-option"
                    type="button"
                    role="switch"
                    aria-checked={isAutoCycleEnabled}
                    onClick={toggleAutoCycle}
                  >
                    <span className="pin-symbol cycle-symbol" aria-hidden="true">⟳</span>
                    <span>
                      <strong>자동 뽀모도로 사이클</strong>
                      <small>
                        집중이 끝나면 {BREAK_MINUTES[SESSION_TYPES.SHORT_BREAK]}분 휴식,{" "}
                        {LONG_BREAK_INTERVAL}번마다 {BREAK_MINUTES[SESSION_TYPES.LONG_BREAK]}분 휴식으로 자동 전환해요.
                        꺼두면 집중 타이머만 반복돼요.
                      </small>
                    </span>
                    <span className="toggle-track" aria-hidden="true">
                      <span />
                    </span>
                  </button>

                  {isTauriApp && (
                    <button
                      className="desktop-option"
                      type="button"
                      role="switch"
                      aria-checked={isAlwaysOnTop}
                      onClick={toggleAlwaysOnTop}
                    >
                      <span className="pin-symbol" aria-hidden="true">⌖</span>
                      <span>
                        <strong>항상 위에 표시</strong>
                        <small>다른 창보다 앞에 타이머를 고정해요</small>
                      </span>
                      <span className="toggle-track" aria-hidden="true">
                        <span />
                      </span>
                    </button>
                  )}

                  {isTauriApp && (
                    <div className="desktop-option shortcut-hint">
                      <span className="pin-symbol" aria-hidden="true">⌨</span>
                      <span>
                        <strong>전역 단축키</strong>
                        <small>다른 앱에서도 {TOGGLE_SHORTCUT_LABEL}로 시작/일시정지</small>
                      </span>
                    </div>
                  )}

                  <button
                    className="color-option"
                    type="button"
                    onClick={() => gaugeColorInputRef.current?.click()}
                  >
                    <span
                      className="color-swatch"
                      style={{ backgroundColor: colors.gaugeColor }}
                    />
                    <span className="color-option-copy">
                      <strong>게이지 색상</strong>
                      <small>{colors.gaugeColor.toUpperCase()}</small>
                    </span>
                    <span className="palette-icon" aria-hidden="true">◉</span>
                  </button>
                  <input
                    ref={gaugeColorInputRef}
                    className="native-color-input"
                    type="color"
                    value={colors.gaugeColor}
                    aria-label="게이지 색상 팔레트"
                    onChange={(event) =>
                      updateColor("gaugeColor", event.target.value)
                    }
                  />

                  <button
                    className="color-option"
                    type="button"
                    onClick={() => clockColorInputRef.current?.click()}
                  >
                    <span
                      className="color-swatch"
                      style={{ backgroundColor: colors.clockColor }}
                    />
                    <span className="color-option-copy">
                      <strong>시계 색상</strong>
                      <small>{colors.clockColor.toUpperCase()}</small>
                    </span>
                    <span className="palette-icon" aria-hidden="true">◉</span>
                  </button>
                  <input
                    ref={clockColorInputRef}
                    className="native-color-input"
                    type="color"
                    value={colors.clockColor}
                    aria-label="시계 색상 팔레트"
                    onChange={(event) =>
                      updateColor("clockColor", event.target.value)
                    }
                  />

                  <div className="color-option dial-color-option">
                    <button
                      className="color-option-picker"
                      type="button"
                      onClick={() => dialColorInputRef.current?.click()}
                    >
                        <span
                          className="color-swatch"
                          style={{ backgroundColor: colors.dialColor }}
                        />
                        <span className="color-option-copy">
                          <strong>내부 다이얼 팔레트</strong>
                          <small>{colors.dialColor.toUpperCase()}</small>
                        </span>
                        <span className="palette-icon" aria-hidden="true">◉</span>
                    </button>
                    <button
                      className="inline-color-toggle"
                      type="button"
                      role="switch"
                      aria-label="내부 다이얼 색상 사용"
                      aria-checked={colors.isDialColorEnabled}
                      onClick={() =>
                        updateColor(
                          "isDialColorEnabled",
                          !colors.isDialColorEnabled,
                        )
                      }
                    >
                      <span className="toggle-track" aria-hidden="true">
                        <span />
                      </span>
                    </button>
                    <input
                      ref={dialColorInputRef}
                      className="native-color-input"
                      type="color"
                      value={colors.dialColor}
                      aria-label="내부 다이얼 색상 팔레트"
                      onChange={(event) =>
                        updateColor("dialColor", event.target.value)
                      }
                    />
                  </div>
                </div>
              )}
            </div>
        </div>

        <div
          className={`timer-device ${isComplete ? "is-complete" : ""} ${isCelebrating ? "is-celebrating" : ""}`}
        >
          <div className="simple-drag-region" data-tauri-drag-region />
          <div className="light-aura" aria-hidden="true" />
          {(isComplete || isCelebrating) && (
            <div
              className="celebration-layer"
              key={celebrationRun}
              aria-hidden="true"
            >
              <div className="firework-rocket rocket-left" />
              <div className="firework-rocket rocket-right" />
              {fireworkBursts.map((burst, burstIndex) => (
                <div
                  className="firework-burst"
                  key={`${burst.x}-${burst.y}`}
                  style={{
                    "--burst-x": `${burst.x}%`,
                    "--burst-y": `${burst.y}%`,
                    "--burst-delay": `${burst.delay}s`,
                    "--burst-cycle": `${burst.cycle}s`,
                  }}
                >
                  {fireworkSparks.map((angle, sparkIndex) => (
                    <span
                      key={angle}
                      style={{
                        "--spark-angle": `${angle}deg`,
                        "--spark-color":
                          (burstIndex + sparkIndex) % 2
                            ? "var(--accent)"
                            : "var(--clock-color)",
                      }}
                    />
                  ))}
                </div>
              ))}
              <div className="confetti-field">
                {confettiPieces.map((piece, index) => (
                  <span
                    key={`${piece.left}-${index}`}
                    style={{
                      "--confetti-left": `${piece.left}%`,
                      "--confetti-delay": `${piece.delay}s`,
                      "--confetti-duration": `${piece.duration}s`,
                      "--confetti-drift": `${piece.drift}px`,
                      "--confetti-rotation": `${piece.rotation}deg`,
                      "--confetti-color": confettiColors[piece.color],
                    }}
                  />
                ))}
              </div>
            </div>
          )}
          {["tl", "tr", "bl", "br"].map((position) => (
            <div
              className={`device-screw screw-${position}`}
              aria-hidden="true"
              key={position}
            />
          ))}

          <div
            className={`clock-dial ${isDragging ? "is-dragging" : ""}`}
            style={{ "--progress-degrees": `${progressDegrees}deg` }}
            role="slider"
            tabIndex={isDialLocked ? -1 : 0}
            aria-label="집중 시간 다이얼"
            aria-valuemin={1}
            aria-valuemax={MAX_MINUTES}
            aria-valuenow={Math.max(1, Math.ceil(remainingSeconds / 60))}
            aria-valuetext={`${Math.ceil(remainingSeconds / 60)}분`}
            aria-disabled={isDialLocked}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={finishDrag}
            onPointerCancel={finishDrag}
            onKeyDown={handleDialKeyDown}
          >
            <div className="dial-face" aria-hidden="true">
              <div className="minute-fill" />
              <div className="tick-ring" />
              <div className="inner-face" />
              <div className="time-edge">
                <span />
              </div>
              {dialNumbers.map((number, index) => {
                const angle = index * 30;
                const x = 50 + Math.sin((angle * Math.PI) / 180) * 39;
                const y = 50 - Math.cos((angle * Math.PI) / 180) * 39;
                return (
                  <span
                    className="dial-number"
                    key={number}
                    style={{ left: `${x}%`, top: `${y}%` }}
                  >
                    {number}
                  </span>
                );
              })}
              <div
                className="valve-rotor"
                style={{ transform: `rotate(${progressDegrees}deg)` }}
              >
                <div className="valve-marker" />
              </div>
              <div className="center-valve">
                <span className="valve-shine" />
                <span className="valve-groove" />
              </div>
            </div>
          </div>

          <div className="simple-control-row">
            <button
              className="simple-action simple-primary-action"
              type="button"
              onClick={toggleTimer}
              disabled={isStartDisabled}
              aria-label={primaryLabel}
              title={primaryLabel}
            >
              <span
                className={isRunning ? "pause-icon" : "play-icon"}
                aria-hidden="true"
              />
            </button>
            <div className="simple-readout-stack">
              <div className="simple-readout" aria-live="polite">
                <strong>{formatTime(remainingSeconds)}</strong>
              </div>
              <div
                className="simple-phase-bridge"
                aria-label={`${phaseLabel} · 오늘 ${todayCount}번 완료`}
              >
                <span aria-hidden="true">{phaseIcon}</span>
                <span>{todayCount}</span>
              </div>
            </div>
            <button
              className="simple-action simple-reset-action hold-to-confirm"
              type="button"
              style={resetFillStyle}
              aria-label="꾹 눌러서 초기화"
              title="꾹 눌러서 초기화"
              {...resetHoldHandlers}
            >
              <span className="hold-fill" aria-hidden="true" />
              <span className="hold-icon" aria-hidden="true">↻</span>
            </button>
          </div>

          <div className="digital-readout normal-readout" aria-live="polite">
            <span className="readout-label">
              {isComplete ? "SESSION COMPLETE" : SESSION_TAGS[phase.type]}
            </span>
            <strong>{formatTime(remainingSeconds)}</strong>
          </div>
        </div>

        <div className="timer-controls">
          <div className="time-input-group">
            <label htmlFor="minutes">집중 시간</label>
            <div className="number-field">
              <input
                id="minutes"
                type="number"
                min="1"
                max={MAX_MINUTES}
                step="1"
                inputMode="numeric"
                value={inputValue}
                disabled={isDialLocked}
                onChange={(event) => handleInputChange(event.target.value)}
                onBlur={normalizeInput}
                aria-describedby="minutes-help"
              />
              <span>분</span>
            </div>
            <p id="minutes-help">1–60분 · 시계 테두리를 직접 돌려도 돼요</p>
          </div>

          <div className="action-row">
            <button
              className="primary-action"
              type="button"
              onClick={toggleTimer}
              disabled={isStartDisabled}
            >
              <span
                className={isRunning ? "pause-icon" : "play-icon"}
                aria-hidden="true"
              />
              {primaryLabel}
            </button>
            <button
              className="reset-action hold-to-confirm"
              type="button"
              style={resetFillStyle}
              aria-label="꾹 눌러서 초기화"
              title="꾹 눌러서 초기화"
              {...resetHoldHandlers}
            >
              <span className="hold-fill" aria-hidden="true" />
              <span className="hold-icon" aria-hidden="true">↻</span>
            </button>
          </div>
        </div>

        <p className={`status-message ${isComplete ? "is-complete" : ""}`}>
          <span aria-hidden="true">{isComplete ? "✦" : "●"}</span>
          {statusCopy}
        </p>
      </section>
    </main>
  );
}
