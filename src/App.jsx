import { useCallback, useEffect, useRef, useState } from "react";

const MAX_MINUTES = 60;
const DEFAULT_MINUTES = 25;
const dialNumbers = Array.from({ length: 12 }, (_, index) =>
  index === 0 ? 60 : index * 5,
);

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

export default function App() {
  const [configuredMinutes, setConfiguredMinutes] = useState(DEFAULT_MINUTES);
  const [inputValue, setInputValue] = useState(String(DEFAULT_MINUTES));
  const [remainingSeconds, setRemainingSeconds] = useState(
    DEFAULT_MINUTES * 60,
  );
  const [isRunning, setIsRunning] = useState(false);
  const [isComplete, setIsComplete] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const endAtRef = useRef(null);
  const draggingRef = useRef(false);

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
      if (nextSeconds === 0) {
        endAtRef.current = null;
        setIsRunning(false);
        setIsComplete(true);
      }
    };

    updateTimer();
    const timerId = window.setInterval(updateTimer, 200);
    return () => window.clearInterval(timerId);
  }, [isRunning]);

  const setTimeFromPoint = useCallback(
    (event) => {
      if (isRunning) return;
      const rect = event.currentTarget.getBoundingClientRect();
      const radians = Math.atan2(
        event.clientY - (rect.top + rect.height / 2),
        event.clientX - (rect.left + rect.width / 2),
      );
      const clockwiseDegrees = (radians * (180 / Math.PI) + 90 + 360) % 360;
      applyMinutes(Math.round(clockwiseDegrees / 6) || MAX_MINUTES);
    },
    [applyMinutes, isRunning],
  );

  const handlePointerDown = (event) => {
    if (isRunning) return;
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
    if (isRunning) return;
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

  const toggleTimer = () => {
    if (isRunning) {
      setIsRunning(false);
      endAtRef.current = null;
      return;
    }
    if (remainingSeconds === 0) {
      setRemainingSeconds(configuredMinutes * 60);
      setIsComplete(false);
    }
    setIsRunning(true);
  };

  const resetTimer = () => {
    setIsRunning(false);
    setIsComplete(false);
    setRemainingSeconds(configuredMinutes * 60);
    endAtRef.current = null;
  };

  const progressDegrees = (remainingSeconds / (MAX_MINUTES * 60)) * 360;
  const statusCopy = isComplete
    ? "좋아요! 집중 시간이 끝났어요."
    : isRunning
      ? "지금 이 순간에만 집중해요."
      : remainingSeconds < configuredMinutes * 60
        ? "잠시 멈췄어요. 준비되면 이어가세요."
        : "다이얼을 돌려 집중 시간을 정해보세요.";
  const primaryLabel = isRunning
    ? "일시정지"
    : remainingSeconds < configuredMinutes * 60 && remainingSeconds > 0
      ? "계속하기"
      : isComplete
        ? "다시 시작"
        : "집중 시작";

  return (
    <main className="page-shell">
      <section className="timer-workspace" aria-labelledby="page-title">
        <header className="brand-row">
          <div>
            <p className="eyebrow">MELLOW MINUTES</p>
            <h1 id="page-title">나만의 집중 타이머</h1>
          </div>
          <div
            className={`status-lamp ${isComplete ? "is-lit" : ""}`}
            aria-label={isComplete ? "타이머 완료 알림 켜짐" : "타이머 대기 중"}
          >
            <span />
          </div>
        </header>

        <div className={`timer-device ${isComplete ? "is-complete" : ""}`}>
          <div className="light-aura" aria-hidden="true" />
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
            tabIndex={isRunning ? -1 : 0}
            aria-label="집중 시간 다이얼"
            aria-valuemin={1}
            aria-valuemax={MAX_MINUTES}
            aria-valuenow={Math.max(1, Math.ceil(remainingSeconds / 60))}
            aria-valuetext={`${Math.ceil(remainingSeconds / 60)}분`}
            aria-disabled={isRunning}
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

          <div className="digital-readout" aria-live="polite">
            <span className="readout-label">
              {isComplete ? "SESSION COMPLETE" : "FOCUS TIME"}
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
                disabled={isRunning}
                onChange={(event) => handleInputChange(event.target.value)}
                onBlur={normalizeInput}
                aria-describedby="minutes-help"
              />
              <span>분</span>
            </div>
            <p id="minutes-help">1–60분 · 시계 테두리를 직접 돌려도 돼요</p>
          </div>

          <div className="action-row">
            <button className="primary-action" type="button" onClick={toggleTimer}>
              <span
                className={isRunning ? "pause-icon" : "play-icon"}
                aria-hidden="true"
              />
              {primaryLabel}
            </button>
            <button
              className="reset-action"
              type="button"
              onClick={resetTimer}
              aria-label="타이머 초기화"
              title="초기화"
            >
              ↻
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
