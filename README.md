# Mellow Pomodoro Timer

다이얼을 직접 돌려 시간을 정하는 아날로그 감성의 뽀모도로 타이머입니다.
웹, 설치형 웹앱(PWA), macOS 메뉴바 앱과 Windows 시스템 트레이 앱에서 같은 타이머와 설정을 사용할 수 있습니다.

## 바로 사용하기

- [웹 버전 실행](https://rnayuta.github.io/mellow-minutes-pomodoro/)
- [최신 macOS 앱 다운로드](https://github.com/RnaYuta/mellow-minutes-pomodoro/releases/latest)

macOS 다운로드 파일은 Mac 종류에 맞게 선택하세요.

- `aarch64.dmg`: Apple Silicon(M1 이상)
- `x64.dmg`: Intel Mac

## 핵심 기능

### 타이머와 조작

- 시계 다이얼을 마우스 또는 터치로 돌려 1분부터 60분까지 설정
- 일반 모드에서는 숫자 입력으로도 집중 시간 설정
- 시작, 일시정지, 재개 지원
- 초기화 버튼을 650ms 동안 길게 눌러 오조작 방지
- 시간이 `00:00`이면 시작 버튼 자동 비활성화
- 남은 시간에 따라 시계 게이지가 자연스럽게 감소
- 키보드와 터치 조작 지원

### 자동 뽀모도로 사이클

- 설정에서 자동 사이클 켜기/끄기
- 집중 종료 후 5분의 짧은 휴식으로 자동 전환
- 집중 4회마다 15분의 긴 휴식으로 전환
- 집중, 짧은 휴식, 긴 휴식 상태를 아이콘으로 표시
- 휴식 종료 시 축하 애니메이션 없이 다음 집중 세션으로 전환

### 집중 기록

- 오늘 완료한 집중 세션 수 표시
- 일반 모드 헤더와 Simple 모드 시간 배지에서 횟수 확인
- 매일 집중 횟수를 초기화할 시간을 직접 설정
- 앱이 백그라운드에 있거나 절전 후 복귀해도 날짜와 초기화 시간 동기화
- 설정과 기록을 브라우저 또는 앱 재실행 후에도 유지

### 종료 알림과 애니메이션

- 집중 또는 휴식 종료 시 차임 소리 재생
- macOS 앱과 웹에서 시스템 알림 지원
- 집중 종료 시 시계 색상을 반영한 불빛 효과
- 폭죽, 로켓 폭죽과 불규칙하게 흩날리는 컨페티 효과
- 초기화하거나 새 타이머를 시작하면 종료 효과 즉시 해제
- 개발 환경에서는 종료 효과 테스트 버튼 제공

### 색상과 테마

- 게이지 색상 커스텀
- 시계와 시간 표시 색상 커스텀
- 내부 다이얼, 눈금, 숫자, 시계침과 중앙 축 색상 커스텀
- 내부 다이얼 커스텀 색상 켜기/끄기
- 사용자 색상을 상태등, 헤더, 안내 아이콘과 종료 효과에 연동
- macOS 및 브라우저의 시스템 라이트·다크 모드 자동 적용
- 다크 모드에서 macOS 시스템 컬러와 자연스럽게 조화되는 UI

### 화면 모드

- 일반 모드: `320 × 540px`
- Simple 모드: `320 × 384px`
- Simple 모드에서는 입력창과 안내 문구를 숨기고 아이콘 중심으로 표시
- Simple 모드 시간 아래에 현재 세션과 집중 횟수를 연결된 배지로 표시
- 웹에서도 브라우저 크기와 무관하게 데스크톱 앱과 동일한 고정 UI 유지

## macOS 앱

- macOS 상단 메뉴바 아이콘과 별도 타이머 창
- 메뉴바 아이콘 옆에 현재 세션 아이콘과 남은 시간 표시
- 다른 창보다 앞에 표시하는 항상 위 옵션
- 창 위치 복원
- 앱 창을 닫아도 메뉴바에서 계속 실행
- 다른 앱을 사용하는 중에도 `⌘⇧M`으로 시작 또는 일시정지
- Apple Silicon과 Intel Mac 지원
- macOS 12 이상 지원

완전히 종료하려면 메뉴바 아이콘을 누르고 `Mellow Pomodoro Timer 종료`를 선택하세요.

> 현재 DMG는 Apple 공증 없이 ad-hoc 서명됩니다. 최초 실행 시 Finder에서 앱을 우클릭하고 `열기`를 선택해야 할 수 있습니다.

## Windows 앱

- 작업 표시줄 우측 시스템 트레이에서 백그라운드 실행
- 타이머 실행 중 트레이 아이콘에 남은 `분` 표시
- 트레이 아이콘에 마우스를 올리면 현재 단계와 정확한 `분:초` 표시
- 트레이 아이콘 클릭 또는 메뉴에서 타이머 창 열기
- 트레이 메뉴에서 항상 위 표시와 앱 종료 지원
- 다른 앱을 사용하는 중에도 `Ctrl+Shift+M`으로 시작 또는 일시정지

## 웹과 PWA

웹 버전은 Chrome, Edge, Safari 등 최신 브라우저에서 실행할 수 있습니다.

Chrome 또는 Edge에서 설치형 웹앱으로 사용하는 방법:

1. [웹 버전](https://rnayuta.github.io/mellow-minutes-pomodoro/)을 엽니다.
2. 타이머의 햄버거 메뉴에서 `앱으로 설치`를 선택합니다.
3. 또는 주소창 오른쪽의 설치 아이콘을 선택합니다.
4. 설치 후 주소창과 탭이 없는 독립 창으로 실행합니다.

PWA는 오프라인 실행을 지원합니다. 웹 알림은 사이트 알림 권한을 허용하고 페이지나 PWA가 실행 중일 때 동작합니다. 운영체제 수준의 항상 위 고정과 메뉴바·시스템 트레이 기능은 데스크톱 앱에서 지원합니다.

## 설정 메뉴

- Simple 모드
- 자동 뽀모도로 사이클
- 집중 횟수 초기화 시간
- 항상 위에 표시(데스크톱 앱)
- 전역 단축키 안내(데스크톱 앱)
- PWA 설치(지원되는 웹 브라우저)
- 게이지 색상
- 시계 색상
- 내부 다이얼 색상과 활성화 토글
- 색상 초기화

## 로컬 개발

필요 환경:

- Node.js 22 이상
- npm
- macOS 앱 개발 시 Rust와 Tauri 개발 도구
- Windows 앱 개발 시 Rust, Microsoft C++ Build Tools와 WebView2

의존성 설치:

```bash
npm install
```

웹 개발 서버:

```bash
npm run dev
```

웹 프로덕션 빌드 및 미리보기:

```bash
npm run build
npm run preview
```

macOS 앱 개발 실행:

```bash
npm run mac:dev
```

현재 Mac 아키텍처용 앱과 DMG 생성:

```bash
npm run mac:build
```

Intel Mac용 별도 빌드:

```bash
npx tauri build --target x86_64-apple-darwin
```

Windows에서 NSIS 설치 파일 생성:

```bash
npm run windows:build
```

## 기술 구성

- React 19
- Vite 8
- Tauri 2
- Rust
- Web App Manifest와 Service Worker 기반 PWA
- GitHub Actions와 GitHub Pages

## 배포

`main` 브랜치가 갱신되면 GitHub Actions가 웹 빌드를 생성하고 GitHub Pages에 자동 배포합니다. macOS 앱은 버전 태그별 GitHub Release에서 Apple Silicon과 Intel DMG로 제공합니다.
