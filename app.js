/* =====================================================================
 * 指尖掌勺 · TIP-TOP CHEF
 * 摄像头手势 + MediaPipe HandLandmarker + DOM/CSS 扁平风厨房
 * 流程：捏合抓食材 → 画圈翻炒 → 握拳出锅 → 评分
 * ===================================================================== */

const CONFIG = {
  camera: { width: { ideal: 1280 }, height: { ideal: 720 } },
  mp: {
    bundle: "./vendor/mediapipe/vision_bundle.mjs",
    wasm: "./vendor/mediapipe/wasm",
    model: "./vendor/models/hand_landmarker.task",
  },
  hand: {
    openMin: 0.94,
    openMax: 1.66,
    pinchMin: 0.16,
    pinchMax: 0.72,
    pinchOn: 0.38,
    pinchOff: 0.60,
    lostMs: 700,
    // 手部移动映射到全屏的放大倍率：小幅移动也能够到托盘和锅
    gainX: 1.8,
    gainY: 1.6,
  },
  stir: {
    minStep: 0.05,
  },
  combo: {
    goodAcc: 0.62,
    maxBonus: 20,
  },
  plate: {
    fistOpen: 0.42,
  },
};

const TAU = Math.PI * 2;
const clamp01 = v => Math.min(1, Math.max(0, v));
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp = (a, b, k) => a + (b - a) * k;
const FORCE_MOUSE = new URLSearchParams(location.search).get("mouse") === "1";

const INGREDIENTS = {
  tomato: {
    name: "番茄", pieces: 4, dot: "#E9503B",
    art: `<svg viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="36" r="21" fill="#E9503B"/><circle cx="25" cy="30" r="6" fill="#FF8A72" opacity=".8"/><path d="M32 15c4-6 12-7 15-5-3 4-8 4-11 7" fill="none" stroke="#4CB963" stroke-width="5" stroke-linecap="round"/><path d="M32 15c-4-6-12-7-15-5 3 4 8 4 11 7" fill="none" stroke="#4CB963" stroke-width="5" stroke-linecap="round"/><circle cx="32" cy="15" r="3.4" fill="#2F8F4E"/></svg>`,
  },
  egg: {
    name: "鸡蛋", pieces: 4, dot: "#FFC93C",
    art: `<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M32 10c11 0 19 11 19 23 0 13-9 21-19 21s-19-8-19-21c0-12 8-23 19-23z" fill="#FFF4D9"/><circle cx="32" cy="34" r="12" fill="#FFC93C"/><circle cx="28" cy="30" r="4" fill="#FFE58A"/></svg>`,
  },
  scallion: {
    name: "葱花", pieces: 3, dot: "#4CB963",
    art: `<svg viewBox="0 0 64 64" aria-hidden="true"><rect x="20" y="12" width="8" height="22" rx="4" fill="#4CB963"/><rect x="36" y="12" width="8" height="22" rx="4" fill="#2F8F4E"/><circle cx="24" cy="41" r="7" fill="none" stroke="#4CB963" stroke-width="3.5"/><circle cx="41" cy="45" r="6" fill="none" stroke="#2F8F4E" stroke-width="3.5"/><circle cx="32" cy="52" r="4.5" fill="none" stroke="#6BD07F" stroke-width="3"/></svg>`,
  },
  greens: {
    name: "油麦菜", pieces: 4, dot: "#3BA55D",
    art: `<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M20 55c-5-14 1-29 12-41 11 10 13 27 4 41" fill="#4CB963"/><path d="M36 55c-2-14 6-27 19-35 5 13 3 29-7 35" fill="#3BA55D"/><path d="M29 55c0-9 2-17 7-25" fill="none" stroke="#2F8F4E" stroke-width="4" stroke-linecap="round"/></svg>`,
  },
  garlic: {
    name: "蒜末", pieces: 5, dot: "#F5E7CE",
    art: `<svg viewBox="0 0 64 64" aria-hidden="true"><circle cx="23" cy="40" r="12" fill="#FFF7E8" stroke="#E2CFAF" stroke-width="2"/><circle cx="42" cy="28" r="9" fill="#FFF7E8" stroke="#E2CFAF" stroke-width="2"/><circle cx="41" cy="46" r="8" fill="#FFF7E8" stroke="#E2CFAF" stroke-width="2"/><path d="M22 27c0-6 2-9 5-11" fill="none" stroke="#CDBBA0" stroke-width="3" stroke-linecap="round"/></svg>`,
  },
  chili: {
    name: "小米辣", pieces: 3, dot: "#E9503B",
    art: `<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M30 18c9 3 16 11 14 24-2 11-13 16-21 12 6-2 9-10 7-16z" fill="#E9503B"/><path d="M30 18c-3-4-7-5-10-4" fill="none" stroke="#2F8F4E" stroke-width="4" stroke-linecap="round"/></svg>`,
  },
  potato: {
    name: "土豆", pieces: 4, dot: "#EBC66B",
    art: `<svg viewBox="0 0 64 64" aria-hidden="true"><ellipse cx="32" cy="36" rx="23" ry="17" fill="#EBC66B" transform="rotate(-12 32 36)"/><circle cx="23" cy="32" r="2.4" fill="#C9A64F"/><circle cx="38" cy="30" r="2" fill="#C9A64F"/><circle cx="34" cy="43" r="2.2" fill="#C9A64F"/><circle cx="45" cy="40" r="1.8" fill="#C9A64F"/></svg>`,
  },
  pepper: {
    name: "青椒", pieces: 4, dot: "#2F8F4E",
    art: `<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M18 22h19c8 0 14 6 14 14s-6 14-14 14H18c-5 0-8-3-8-8V30c0-5 3-8 8-8z" fill="#3BA55D"/><path d="M18 22h19c3 0 6 1 8 2-3 3-8 4-13 4h-8z" fill="#6BD07F" opacity=".7"/><path d="M28 18c3-3 7-4 10-2" fill="none" stroke="#2F8F4E" stroke-width="3" stroke-linecap="round"/></svg>`,
  },
  milk: {
    name: "牛奶", pieces: 5, dot: "#EAF4FA",
    art: `<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M23 14h18l6 10v26a4 4 0 0 1-4 4H21a4 4 0 0 1-4-4V24z" fill="#FFFFFF" stroke="#D8E6F1" stroke-width="2"/><path d="M23 14h18l6 10H17z" fill="#DCEEF9"/><path d="M20 32h24" stroke="#C9E2F2" stroke-width="3" stroke-linecap="round"/><circle cx="32" cy="43" r="6" fill="#E8F6FE" stroke="#BEDCEE" stroke-width="2"/></svg>`,
  },
  sugar: {
    name: "白糖", pieces: 5, dot: "#F1E7D6",
    art: `<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M17 32h30l-4 18H21z" fill="#FFFDF7" stroke="#E6D9C3" stroke-width="2"/><rect x="22" y="20" width="9" height="9" rx="2" fill="#FFF" stroke="#E6D9C3" stroke-width="1.5"/><rect x="34" y="16" width="8" height="8" rx="2" fill="#FFF" stroke="#E6D9C3" stroke-width="1.5"/><rect x="34" y="26" width="8" height="8" rx="2" fill="#FFFDF7" stroke="#E6D9C3" stroke-width="1.5"/><path d="M14 51h36" stroke="#DFD1BC" stroke-width="3" stroke-linecap="round"/></svg>`,
  },
  strawberry: {
    name: "草莓", pieces: 4, dot: "#E9503B",
    art: `<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M32 16c11 0 17 8 15 18-2 10-9 17-15 21-6-4-13-11-15-21-2-10 4-18 15-18z" fill="#E9503B"/><path d="M32 16c-4-6-9-8-14-7 2 4 6 6 10 9" fill="#4CB963"/><circle cx="25" cy="30" r="1.6" fill="#FFE1D6"/><circle cx="36" cy="27" r="1.6" fill="#FFE1D6"/><circle cx="30" cy="38" r="1.6" fill="#FFE1D6"/><circle cx="40" cy="36" r="1.6" fill="#FFE1D6"/><circle cx="34" cy="47" r="1.6" fill="#FFE1D6"/></svg>`,
  },
  cream: {
    name: "奶油", pieces: 4, dot: "#FFF3DC",
    art: `<svg viewBox="0 0 64 64" aria-hidden="true"><circle cx="24" cy="42" r="11" fill="#FFF9EE" stroke="#EADCC6" stroke-width="2"/><circle cx="38" cy="36" r="9" fill="#FFF9EE" stroke="#EADCC6" stroke-width="2"/><circle cx="40" cy="47" r="8" fill="#FFFCF5" stroke="#EADCC6" stroke-width="2"/><path d="M37 26c1-5 4-8 7-9" fill="none" stroke="#E0CFB5" stroke-width="3" stroke-linecap="round"/></svg>`,
  },
  biscuit: {
    name: "饼干碎", pieces: 5, dot: "#D9B98C",
    art: `<svg viewBox="0 0 64 64" aria-hidden="true"><rect x="18" y="22" width="18" height="16" rx="4" fill="#E3C79E" stroke="#C9A879" stroke-width="2" transform="rotate(-8 27 30)"/><rect x="36" y="30" width="14" height="13" rx="3" fill="#DDBB8B" stroke="#C9A879" stroke-width="2" transform="rotate(10 43 36)"/><rect x="24" y="42" width="12" height="11" rx="3" fill="#E8CFA9" stroke="#C9A879" stroke-width="2" transform="rotate(6 30 47)"/><circle cx="24" cy="28" r="1.5" fill="#B5925F"/><circle cx="44" cy="35" r="1.4" fill="#B5925F"/></svg>`,
  },
  lemon: {
    name: "柠檬", pieces: 4, dot: "#E4B23C",
    art: `<svg viewBox="0 0 64 64" aria-hidden="true"><ellipse cx="31" cy="36" rx="19" ry="14" fill="#F0C64A"/><ellipse cx="31" cy="36" rx="14" ry="10" fill="#FFF4C2"/><path d="M31 26v20M21 31l20 10M41 31L21 41" stroke="#E4B23C" stroke-width="2"/><path d="M45 24c3-3 7-4 10-2" fill="none" stroke="#4CB963" stroke-width="3" stroke-linecap="round"/></svg>`,
  },
  mint: {
    name: "薄荷", pieces: 4, dot: "#4CB963",
    art: `<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M32 52c0-12 2-22 8-30" fill="none" stroke="#2F8F4E" stroke-width="3" stroke-linecap="round"/><path d="M32 40c-8-1-13-5-14-12 8-1 13 3 14 12z" fill="#5CC26F"/><path d="M36 30c7-1 12-5 13-11-7-1-12 3-13 11z" fill="#3BA55D"/><path d="M37 48c7 0 11-3 13-9-7-1-12 2-13 9z" fill="#4CB963"/></svg>`,
  },
  soda: {
    name: "气泡水", pieces: 4, dot: "#BFE8F5",
    art: `<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M20 16h24l-3 34H23z" fill="#EAF8FD" stroke="#BEDCEE" stroke-width="2"/><path d="M21 26h22" stroke="#AED6E9" stroke-width="2"/><circle cx="30" cy="36" r="2.6" fill="#FFF" stroke="#A9D2E6" stroke-width="1.4"/><circle cx="38" cy="44" r="2.2" fill="#FFF" stroke="#A9D2E6" stroke-width="1.4"/><circle cx="33" cy="49" r="2" fill="#FFF" stroke="#A9D2E6" stroke-width="1.4"/><circle cx="40" cy="30" r="1.8" fill="#FFF" stroke="#A9D2E6" stroke-width="1.4"/></svg>`,
  },
  tea: {
    name: "红茶", pieces: 4, dot: "#B0703C",
    art: `<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M26 18h22l-3 26H29z" fill="#C98B52" stroke="#A56C33" stroke-width="2"/><path d="M24 18h26" stroke="#8E5E37" stroke-width="3" stroke-linecap="round"/><path d="M38 44v6c0 4 3 7 7 7s7-3 7-7" fill="none" stroke="#B9C7CE" stroke-width="3"/><rect x="48" y="37" width="12" height="10" rx="2" fill="#FFFDF7" stroke="#D6C6AF" stroke-width="2"/></svg>`,
  },
  tapioca: {
    name: "珍珠", pieces: 5, dot: "#4A3728",
    art: `<svg viewBox="0 0 64 64" aria-hidden="true"><circle cx="24" cy="40" r="9" fill="#4A3728"/><circle cx="39" cy="32" r="7" fill="#3A2A1F"/><circle cx="42" cy="46" r="8" fill="#4A3728"/><circle cx="29" cy="52" r="6" fill="#3A2A1F"/><circle cx="22" cy="28" r="2" fill="#7A6656"/></svg>`,
  },
  vinegar: {
    name: "香醋", pieces: 3, dot: "#8E5E37",
    art: `<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M27 10h10v8l5 8v24a4 4 0 0 1-4 4H26a4 4 0 0 1-4-4V26l5-8z" fill="#8E5E37"/><path d="M22 30h20v9H22z" fill="#FFF3DC"/><rect x="26" y="6" width="12" height="6" rx="2" fill="#5C3A1E"/><path d="M25 45h14" stroke="#6E4726" stroke-width="3" stroke-linecap="round"/></svg>`,
  },
  ice: {
    name: "冰块", pieces: 4, dot: "#BFE8F5",
    art: `<svg viewBox="0 0 64 64" aria-hidden="true"><rect x="11" y="27" width="20" height="20" rx="5" fill="#DFF4FB" stroke="#A9D2E6" stroke-width="2" transform="rotate(-8 21 37)"/><rect x="33" y="17" width="18" height="18" rx="5" fill="#EAF8FD" stroke="#A9D2E6" stroke-width="2" transform="rotate(10 42 26)"/><rect x="31" y="39" width="17" height="17" rx="5" fill="#DFF4FB" stroke="#A9D2E6" stroke-width="2" transform="rotate(6 39 47)"/><path d="M17 33l8 3M38 24l6 5" stroke="#FFFFFF" stroke-width="2.4" stroke-linecap="round"/></svg>`,
  },
  honey: {
    name: "蜂蜜", pieces: 3, dot: "#E4A93C",
    art: `<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M18 27h28v21a6 6 0 0 1-6 6H24a6 6 0 0 1-6-6z" fill="#F3C14F" stroke="#D9A33A" stroke-width="2"/><path d="M18 27c0-4 6-7 14-7s14 3 14 7" fill="#E4A93C"/><ellipse cx="32" cy="27" rx="14" ry="4" fill="#F7D57E"/><path d="M26 34c3 4 9 4 12 0" fill="none" stroke="#C98A2D" stroke-width="2.4" stroke-linecap="round"/><circle cx="46" cy="14" r="4" fill="#E4A93C"/><path d="M46 18v6" stroke="#C98A2D" stroke-width="3" stroke-linecap="round"/></svg>`,
  },
};

const RECIPES = {
  tomatoEgg: {
    name: "番茄炒蛋", tagline: "新手 · 8 分钟", time: "8 分钟", category: "hot",
    ingredients: ["tomato", "egg", "scallion"],
    theme: { accent: "#FF6B57", deep: "#D94634", soft: "#FFF1E4" },
    flow: [
      { type: "pick", name: "备料下锅", items: ["tomato", "egg"],
        desc: "捏合手指抓起卡片，移到锅上方松开；也可以按数字键直接下锅。" },
      { type: "stir", name: "翻炒", action: "circle", turns: 2, autoMs: 3800,
        title: "张开手掌，画圈翻炒",
        desc: "手掌在锅上方缓慢画圈，圈数够了自动进入下一步；也可以按 Space 自动翻炒。" },
      { type: "season", name: "调味", action: "sway", target: 4, autoMs: 3000,
        title: "左右晃动手掌，撒盐调味",
        desc: "手掌在锅上方左右晃动，节奏稳一点；也可以按 Space 自动调味。" },
      { type: "pick", name: "撒葱花", items: ["scallion"],
        title: "出锅前撒上葱花",
        desc: "葱花要出锅前再放才香：捏合抓起葱花移到锅上方松开，或按对应数字键。" },
      { type: "plate", name: "出锅装盘", action: "hold",
        title: "握拳一下，出锅装盘",
        desc: "握拳保持一下；鼠标模式下按住左键，或直接按 Enter。" },
    ],
    plate: [
      ["#E9503B", 26, 30, 24, 20, -18],
      ["#E9503B", 46, 44, 24, 20, 12],
      ["#E9503B", 33, 57, 24, 20, 28],
      ["#FFE9A8", 39, 25, 27, 22, 8],
      ["#FFC93C", 39, 25, 15, 12, 0],
      ["#FFE9A8", 29, 46, 27, 22, -12],
      ["#FFC93C", 29, 46, 15, 12, 0],
      ["#4CB963", 46, 33, 8, 8, 0, true],
      ["#4CB963", 36, 42, 8, 8, 0, true],
      ["#4CB963", 52, 48, 8, 8, 0, true],
    ],
    flavor: "茄红出汁、蛋嫩带汁，是最稳的家常味。",
  },
  garlicGreens: {
    name: "蒜蓉油麦菜", tagline: "快手 · 5 分钟", time: "5 分钟", category: "hot",
    ingredients: ["greens", "garlic", "chili"],
    theme: { accent: "#2EAE7D", deep: "#1F8A63", soft: "#EAF7F0" },
    tuning: { plateHold: 750 },
    flow: [
      { type: "pick", name: "备料下锅",
        desc: "捏合手指抓起卡片，移到锅上方松开；也可以按数字键直接下锅。" },
      { type: "stir", name: "切翻", action: "chop", target: 6, autoMs: 3200,
        title: "手掌上下切翻",
        desc: "手掌在锅上方快速上下往返，让菜受热均匀；或按 Space 自动翻炒。" },
      { type: "season", name: "撒蒜末", action: "tap", target: 5, autoMs: 2600,
        title: "快速捏合，撒蒜末",
        desc: "快速捏合再松开 5 次，把蒜末和辣椒撒匀；或按 Space 自动撒。" },
      { type: "plate", name: "出锅装盘", action: "hold",
        title: "握拳一下，出锅装盘",
        desc: "握拳保持一下；鼠标按住左键，或直接按 Enter。" },
    ],
    ui: { scoreLabels: { craft: "翻炒手感", season: "撒料时机" } },
    plate: [
      ["#4CB963", 24, 30, 34, 12, -25],
      ["#3BA55D", 45, 26, 32, 12, 20],
      ["#5CC26F", 34, 44, 36, 12, -8],
      ["#2F8F4E", 28, 58, 30, 11, 18],
      ["#FFF3DC", 46, 38, 9, 9, 0],
      ["#FFF3DC", 36, 52, 8, 8, 0],
      ["#FFF3DC", 52, 52, 8, 8, 0],
      ["#E9503B", 40, 34, 8, 8, 0, true],
      ["#E9503B", 33, 46, 8, 8, 0, true],
    ],
    flavor: "蒜香扑鼻，菜叶翠绿不出水，锅气十足。",
  },
  potatoShreds: {
    name: "酸辣土豆丝", tagline: "刀工 · 10 分钟", time: "10 分钟", category: "hot",
    ingredients: ["potato", "pepper", "chili", "vinegar"],
    theme: { accent: "#E39A2D", deep: "#C4801D", soft: "#FFF3DC" },
    tuning: { plateHold: 900 },
    flow: [
      { type: "pick", name: "备料下锅",
        desc: "捏合手指抓起卡片，移到锅上方松开；也可以按数字键直接下锅。" },
      { type: "stir", name: "猛炒", action: "bigCircle", turns: 2.5, autoMs: 4200,
        title: "画大圈猛炒",
        desc: "手掌在锅上方画大圈，圈要过锅心；或按 Space 自动翻炒。" },
      { type: "season", name: "淋醋", action: "shake", target: 8, autoMs: 2800,
        title: "快速抖动，淋醋调味",
        desc: "手掌在锅上方快速小幅抖动，把香醋淋得均匀；或按 Space 自动。" },
      { type: "stir", name: "快翻出锅", action: "fastCircle", turns: 1, autoMs: 1600,
        title: "快速小圈，快翻出锅",
        desc: "快速画一圈让酸味裹匀，趁脆出锅；或按 Space 自动。" },
      { type: "plate", name: "出锅装盘", action: "hold",
        title: "握拳一下，出锅装盘",
        desc: "握拳保持一下；鼠标按住左键，或直接按 Enter。" },
    ],
    ui: { scoreLabels: { season: "调味时机" } },
    plate: [
      ["#F2D078", 23, 30, 32, 7, -18],
      ["#F5D98B", 43, 36, 34, 7, 12],
      ["#E9C05E", 30, 44, 36, 7, -6],
      ["#F2D078", 40, 52, 30, 7, 22],
      ["#3BA55D", 27, 35, 24, 7, 14],
      ["#4CB963", 46, 52, 26, 7, -18],
      ["#E9503B", 40, 29, 7, 7, 0, true],
      ["#E9503B", 35, 50, 7, 7, 0, true],
      ["#E9503B", 53, 42, 7, 7, 0, true],
    ],
    flavor: "酸辣脆爽，根根分明，火候一过就容易软。",
  },
  caramelPudding: {
    name: "焦糖布丁", tagline: "甜品 · 慢蒸", time: "20 分钟", category: "dessert",
    ingredients: ["egg", "milk", "sugar"],
    theme: { accent: "#C98A4B", deep: "#A56C33", soft: "#FBF0DF" },
    tuning: { plateHold: 1300 },
    flow: [
      { type: "pick", name: "备料入模",
        desc: "捏合抓起材料，移到模具上方松开；也可以按数字键直接放入。" },
      { type: "stir", name: "搅拌蛋液", action: "slowCircle", turns: 2.5, autoMs: 4600,
        title: "慢速画圈，搅拌蛋液",
        desc: "手掌在锅上方慢速画圈，把蛋液搅得细腻顺滑；或按 Space 自动搅拌。" },
      { type: "season", name: "撒糖", action: "tap", target: 4, autoMs: 2600,
        title: "捏合点按，撒白糖",
        desc: "捏合再松开 4 次，白糖要撒得颗粒分明；或按 Space 自动撒糖。" },
      { type: "rest", name: "静置凝固", holdMs: 2600,
        title: "张开手掌，悬停静置",
        desc: "张开手掌悬停在模具上方别动，让布丁凝固；或按 Enter 提前出模。" },
      { type: "plate", name: "倒扣装盘", action: "longHold",
        title: "握拳久一点，倒扣装盘",
        desc: "握拳保持久一点完成脱模；鼠标按住左键，或直接按 Enter。" },
    ],
    ui: { scoreLabels: { plate: "脱模手法" } },
    plate: [
      ["#F6E3C4", 28, 36, 40, 28, 0],
      ["#C98A4B", 36, 24, 26, 12, -6],
      ["#B97636", 38, 54, 16, 7, 0],
      ["#FFF8EC", 24, 32, 10, 8, 0],
      ["#E9503B", 45, 32, 6, 6, 0, true],
    ],
    flavor: "焦糖脆壳，蛋奶滑嫩，勺子一碰就晃。",
  },
  strawberryCup: {
    name: "草莓奶油杯", tagline: "甜品 · 免火", time: "6 分钟", category: "dessert",
    ingredients: ["strawberry", "cream", "biscuit", "honey"],
    theme: { accent: "#E85D75", deep: "#C9435C", soft: "#FFF0F3" },
    tuning: { plateHold: 550 },
    flow: [
      { type: "pick", name: "备料装杯", items: ["strawberry", "cream", "honey"],
        desc: "捏合抓起材料，移到杯子上方松开；也可以按数字键直接放入。" },
      { type: "stir", name: "打发奶油", action: "fastCircle", turns: 3, autoMs: 3200,
        title: "快速小圈，打发奶油",
        desc: "手掌快速画小圈，把奶油打发到蓬松；或按 Space 自动打发。" },
      { type: "season", name: "撒糖粉", action: "chop", target: 5, autoMs: 2200,
        title: "上下移动，撒糖粉",
        desc: "手掌上下往返 5 次，把糖粉撒得均匀如雪；或按 Space 自动撒粉。" },
      { type: "pick", name: "撒饼干碎", items: ["biscuit"],
        title: "最后撒上饼干碎",
        desc: "饼干碎最后放才脆：捏合抓起饼干碎移到杯子上方松开，或按对应数字键。" },
      { type: "plate", name: "封杯", action: "quickHold",
        title: "快速握拳，封杯出餐",
        desc: "快速握拳一下就松手完成封杯；鼠标按住左键一放，或按 Enter。" },
    ],
    ui: { scoreLabels: { craft: "打发手感", plate: "装杯手法" } },
    plate: [
      ["#F7DCE2", 28, 44, 36, 15, 0],
      ["#FFF4E8", 32, 35, 27, 12, 0],
      ["#E9503B", 27, 27, 12, 12, 0],
      ["#E9503B", 44, 30, 11, 11, 0],
      ["#E9503B", 36, 23, 9, 9, 0],
      ["#D9B98C", 47, 55, 6, 5, 0],
      ["#D9B98C", 34, 57, 5, 5, 0],
    ],
    flavor: "奶油轻、草莓酸，饼干碎把甜味压得刚好。",
  },
  lemonSoda: {
    name: "柠檬气泡水", tagline: "饮品 · 冰爽", time: "3 分钟", category: "drink",
    ingredients: ["lemon", "mint", "soda", "ice"],
    theme: { accent: "#E4B23C", deep: "#C2932A", soft: "#FFFAE6" },
    tuning: { plateHold: 600 },
    flow: [
      { type: "pick", name: "备料入杯", items: ["lemon", "soda", "ice"],
        desc: "捏合抓起材料，移到杯子上方松开；也可以按数字键直接加入。" },
      { type: "stir", name: "画圈摇匀", action: "circle", turns: 1.5, autoMs: 2400,
        title: "画圈摇匀",
        desc: "手掌在杯上方画圈，把柠檬、冰块和气泡水摇匀；或按 Space 自动摇匀。" },
      { type: "pick", name: "加薄荷", items: ["mint"],
        title: "最后放入薄荷",
        desc: "薄荷最后放，香气不被气泡冲散：捏合抓起薄荷移到杯子上方松开，或按对应数字键。" },
      { type: "plate", name: "封杯", action: "quickHold",
        title: "快速握拳，封杯出餐",
        desc: "快速握拳一下就松手完成封杯；鼠标按住左键一放，或按 Enter。" },
    ],
    plate: [
      ["#FBF0B4", 28, 42, 38, 20, 0],
      ["#FFFDF6", 35, 36, 10, 8, 8],
      ["#FFFDF6", 47, 40, 9, 7, 4],
      ["#FFF4C2", 27, 27, 8, 8, 0, true],
      ["#E4B23C", 39, 27, 15, 15, 0],
      ["#FFF8D8", 42, 30, 9, 9, 0],
      ["#4CB963", 46, 23, 7, 7, 0],
      ["#4CB963", 31, 24, 6, 6, 0],
    ],
    flavor: "气泡够足、柠檬够酸，薄荷一压就清爽。",
  },
  milkTea: {
    name: "冰摇奶茶", tagline: "饮品 · 手摇", time: "4 分钟", category: "drink",
    ingredients: ["tea", "milk", "tapioca", "ice"],
    theme: { accent: "#B07A4E", deep: "#8E5E37", soft: "#F9EFE5" },
    tuning: { plateHold: 800 },
    flow: [
      { type: "pick", name: "备料入杯",
        desc: "捏合抓起材料，移到杯子上方松开；也可以按数字键直接加入。" },
      { type: "stir", name: "摇茶", action: "chop", target: 6, autoMs: 2800,
        title: "手掌上下摇茶",
        desc: "手掌上下往返 6 次，把茶和奶摇到融合；或按 Space 自动摇茶。" },
      { type: "season", name: "加珍珠", action: "tap", target: 4, autoMs: 2000,
        title: "快速点按，加珍珠",
        desc: "快速捏合 4 次，把珍珠加进去；或按 Space 自动加珍珠。" },
      { type: "plate", name: "封杯", action: "hold",
        title: "握拳一下，封杯出餐",
        desc: "握拳保持一下完成封杯；鼠标按住左键，或直接按 Enter。" },
    ],
    ui: { scoreLabels: { craft: "摇茶手感", season: "配料控制" } },
    plate: [
      ["#D8B08A", 29, 40, 36, 22, 0],
      ["#F4E4D2", 31, 31, 32, 12, 0],
      ["#4A3728", 35, 51, 5, 5, 0],
      ["#4A3728", 43, 54, 5, 5, 0],
      ["#4A3728", 50, 50, 5, 5, 0],
      ["#4A3728", 29, 53, 5, 5, 0],
      ["#4CB963", 44, 24, 5, 5, 0],
    ],
    flavor: "茶香压住奶甜，珍珠嚼起来才对味。",
  },
};

const RECIPE_KEYS = Object.keys(RECIPES);
const DEFAULT_RECIPE = RECIPE_KEYS[0];

const CATEGORIES = [
  { key: "hot", label: "热菜" },
  { key: "dessert", label: "甜品" },
  { key: "drink", label: "饮品" },
];

const CATEGORY_UI = {
  hot: {
    pickTitle: "抓起第一样食材", pickAgain: "继续下料", pickVerb: "下锅",
    pickDesc: "捏合手指抓起卡片，移到锅上方松开；也可以按 {keys} 直接下锅。",
    scoreLabels: { drop: "下锅准头", craft: "火候控制", season: "调味手感", plate: "装盘手法" },
  },
  dessert: {
    pickTitle: "把第一样材料放进模具", pickAgain: "继续加料", pickVerb: "放入",
    pickDesc: "捏合抓起材料，移到模具上方松开；也可以按 {keys} 直接放入。",
    scoreLabels: { drop: "备料准头", craft: "搅拌手感", season: "甜度控制", plate: "装盘手法" },
  },
  drink: {
    pickTitle: "把第一样材料放进杯里", pickAgain: "继续加料", pickVerb: "加入",
    pickDesc: "捏合抓起材料，移到杯子上方松开；也可以按 {keys} 直接加入。",
    scoreLabels: { drop: "备料准头", craft: "摇匀手感", season: "冰量控制", plate: "封杯手法" },
  },
};

const CATEGORY_TUNING = {
  hot: { turns: 2, radius: 1.6, target: 4, stirAutoMs: 3800, seasonAutoMs: 3000, plateHold: 850 },
  dessert: { turns: 2.5, radius: 1.5, target: 3, stirAutoMs: 4200, seasonAutoMs: 2400, plateHold: 1050 },
  drink: { turns: 1.25, radius: 1.7, target: 2, stirAutoMs: 2600, seasonAutoMs: 1800, plateHold: 650 },
};

/* ---------- 动作模板：每道菜各步骤走不同的进度累积逻辑 ---------- */
// circle        画圈（可要求 minRadiusRatio 大圈；slow 慢速算好；fast 快才算好）
// chop          上下往返切翻（检测 Y 轴反转次数）
// sway          左右往返（检测 X 轴反转次数）
// shake         快速抖动（短时间内高频方向变化）
// tap           连续捏合点按（pinched 状态切换次数）
// hold          握拳保持（open < 阈值持续 holdMs）
// quickHold     快速封杯（握拳时长更短）
// longHold      长时间脱模（握拳时长更长）
const ACTIONS = {
  circle:      { kind: "stir",  param: "turns" },
  bigCircle:   { kind: "stir",  param: "turns", minRadiusRatio: 0.55 },
  fastCircle:  { kind: "stir",  param: "turns", speedTarget: 4.5 },   // 圈/秒 附近最佳
  slowCircle:  { kind: "stir",  param: "turns", speedTarget: 1.1 },   // 慢才好
  chop:        { kind: "stir",  param: "target", axis: "y" },
  sway:        { kind: "season",param: "target", axis: "x" },
  shake:       { kind: "season",param: "target", jitter: true },
  tap:         { kind: "season",param: "target", tap: true },
  hold:        { kind: "plate", param: "plateHold" },
  quickHold:   { kind: "plate", param: "plateHold", scale: 0.7 },
  longHold:    { kind: "plate", param: "plateHold", scale: 1.45 },
};

function recipeUI(r) {
  const base = CATEGORY_UI[r.category];
  const over = r.ui || {};
  return Object.assign({}, base, over, {
    scoreLabels: Object.assign({}, base.scoreLabels, over.scoreLabels || {}),
  });
}
function recipeTune(r) {
  return Object.assign({}, CATEGORY_TUNING[r.category], r.tuning || {});
}

/* ---------- 流程与计分桶：步骤数可变，分数归一化到 100 ---------- */
const STEP_BUCKET = { pick: "drop", stir: "craft", rest: "craft", season: "season", plate: "plate" };
const BUCKET_BASE = { drop: 30, craft: 35, season: 15, plate: 20 };
const BUCKET_ROW_ID = { drop: "scoreDrop", craft: "scoreStir", season: "scoreSeason", plate: "scorePlate" };
const STEP_TYPE_NAME = { pick: "备料", stir: "烹制", rest: "静置", season: "调味", plate: "装盘" };

function flowBuckets(flow) {
  const set = new Set(flow.map(s => STEP_BUCKET[s.type]));
  return ["drop", "craft", "season", "plate"].filter(b => set.has(b));
}

// 缺失环节（如饮品无调味）按 base 比例把分数分配给存在的环节，凑满 100
function bucketWeights(buckets) {
  const total = buckets.reduce((s, b) => s + BUCKET_BASE[b], 0);
  const exact = buckets.map(b => BUCKET_BASE[b] / total * 100);
  const out = exact.map(v => Math.floor(v));
  let rem = 100 - out.reduce((s, v) => s + v, 0);
  const order = exact.map((v, i) => [v - Math.floor(v), i]).sort((a, b) => b[0] - a[0]);
  for (let i = 0; i < rem; i++) out[order[i % order.length][1]]++;
  const map = {};
  buckets.forEach((b, i) => { map[b] = out[i]; });
  return map;
}

// 把菜谱的 flow 补全成可执行的步骤对象
function resolveFlow(recipe) {
  const tune = recipeTune(recipe);
  const flow = recipe.flow.map(raw => {
    const step = Object.assign({}, raw);
    if (step.type === "stir") {
      step.action = ACTIONS[step.action || "circle"];
      step.turns = step.turns ?? tune.turns;
      step.target = step.target ?? tune.target;
      step.autoMs = step.autoMs ?? tune.stirAutoMs;
      step.radius = step.radius ?? tune.radius;
    } else if (step.type === "season") {
      step.action = ACTIONS[step.action || "sway"];
      step.target = step.target ?? tune.target;
      step.autoMs = step.autoMs ?? tune.seasonAutoMs;
    } else if (step.type === "plate") {
      step.action = ACTIONS[step.action || "hold"];
      step.holdNeed = Math.round((step.holdMs ?? tune.plateHold) * (step.action.scale || 1));
    } else if (step.type === "rest") {
      step.holdMs = step.holdMs ?? 2200;
    }
    return step;
  });
  // pick 步未显式声明 items 时，第一个未声明的 pick 步分得所有未分配的食材
  const assigned = new Set(flow.flatMap(s => (s.type === "pick" && s.items) ? s.items : []));
  const rest = recipe.ingredients.filter(k => !assigned.has(k));
  const firstOpen = flow.find(s => s.type === "pick" && !s.items);
  if (firstOpen) firstOpen.items = rest.length ? rest : [...recipe.ingredients];
  flow.forEach(s => { if (s.type === "pick" && !s.items) s.items = [...recipe.ingredients]; });
  return flow;
}

/* 当前 pick 步允许下锅的食材（非 pick 阶段返回空数组） */
function pickItems() {
  const st = S.flow[S.stepIdx];
  return (S.phase === "pick" && st && st.type === "pick") ? (st.items || S.ingredients) : [];
}

function freshStir() {
  return { total: 0, lastAngle: null, activeMs: 0, auto: false, progress: 0,
           lastAxis: null, axisDir: 0, axisPivot: 0, axisReversals: 0,
           speedSamples: [], speedAvg: 0 };
}
function freshSeason() {
  return { reversals: 0, lastX: null, dir: 0, pivot: 0, auto: false, autoAcc: 0, activeMs: 0, progress: 0, autoUsed: false,
           tapCount: 0, lastPinchWasDown: false,
           jitterReversals: 0, lastAxis: null, axisDir: 0, axisPivot: 0 };
}

/* ---------------------------- 纪录与成就 ---------------------------- */
const STORE_KEY = "tipchef.records.v1";

const GUESTS = [
  { name: "邻居王阿姨", initial: "王", table: "3 号桌 · 现炒", high: "火候稳，这盘我认。", mid: "家常味，配碗米饭刚好。", low: "心意收到了，火候再练练。" },
  { name: "加班的小陈", initial: "陈", table: "7 号桌 · 夜宵", high: "这口下去，今天不算白加。", mid: "有锅气，比楼下外卖强。", low: "能吃饱，就是盐有点抢戏。" },
  { name: "美食博主", initial: "食", table: "窗边位 · 拍摄中", high: "可以上菜单，我要拍。", mid: "镜头感不错，味道再稳一点。", low: "构图可以，火候再练。" },
  { name: "挑食的小朋友", initial: "小", table: "2 号桌 · 少放辣", high: "这个我能吃两碗饭。", mid: "还行，下次多放点蛋。", low: "我尝一口就够了。" },
];

const BADGES = [
  { id: "first", name: "首秀", desc: "完成第一盘菜", test: r => r.totalGames >= 1 },
  { id: "three", name: "三星", desc: "单局拿到 3 星（90 分以上）", test: r => Object.values(r.best).some(v => v >= 90) },
  { id: "combo", name: "连击", desc: "最高连击达到 6", test: r => r.maxCombo >= 6 },
  { id: "all", name: "全菜", desc: "每道菜各做一次", test: r => RECIPE_KEYS.every(k => (r.plays[k] || 0) > 0) },
];

function loadRecords() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    const data = raw ? JSON.parse(raw) : null;
    return {
      best: data && typeof data.best === "object" && data.best ? data.best : {},
      plays: data && typeof data.plays === "object" && data.plays ? data.plays : {},
      totalGames: Number(data && data.totalGames) || 0,
      maxCombo: Number(data && data.maxCombo) || 0,
    };
  } catch (e) {
    return { best: {}, plays: {}, totalGames: 0, maxCombo: 0 };
  }
}

function saveRecords() {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(S.records));
  } catch (e) { /* 隐私模式下静默失败 */ }
}

const el = {
  stove: document.querySelector(".stove"),
  pan: document.querySelector("#pan"),
  panInner: document.querySelector("#panInner"),
  steam: document.querySelector("#steamLayer"),
  phaseIndex: document.querySelector("#phaseIndex"),
  phaseBadge: document.querySelector("#phaseBadge"),
  phaseTitle: document.querySelector("#phaseTitle"),
  phaseDesc: document.querySelector("#phaseDesc"),
  phaseFill: document.querySelector("#phaseFill"),
  stepper: document.querySelector("#stepper"),
  steps: [],
  gateSteps: document.querySelector(".gate-steps"),
  resultRows: document.querySelector(".result-rows"),
  keyDigits: document.querySelector("#keyDigits"),
  trayCount: document.querySelector("#trayCount"),
  trayList: document.querySelector("#trayList"),
  cards: [],
  gate: document.querySelector("#gate"),
  startBtn: document.querySelector("#startBtn"),
  startText: document.querySelector("#startText"),
  startHint: document.querySelector("#startHint"),
  dishOptions: document.querySelector("#dishOptions"),
  dishTabs: document.querySelector("#dishTabs"),
  recipeName: document.querySelector("#recipeName"),
  recipeTag: document.querySelector("#recipeTag"),
  result: document.querySelector("#result"),
  againBtn: document.querySelector("#againBtn"),
  switchBtn: document.querySelector("#switchBtn"),
  resultDishName: document.querySelector("#resultDishName"),
  dishShapes: document.querySelector("#dishShapes"),
  seasonLayer: document.querySelector("#seasonLayer"),
  comboPop: document.querySelector("#comboPop"),
  comboNum: document.querySelector("#comboNum"),
  badgeList: document.querySelector("#badgeList"),
  recordSummary: document.querySelector("#recordSummary"),
  scoreSeason: document.querySelector("#scoreSeason"),
  comboLine: document.querySelector("#comboLine"),
  recordLine: document.querySelector("#recordLine"),
  receiptNo: document.querySelector("#receiptNo"),
  receiptAvatar: document.querySelector("#receiptAvatar"),
  receiptGuest: document.querySelector("#receiptGuest"),
  receiptTable: document.querySelector("#receiptTable"),
  receiptComment: document.querySelector("#receiptComment"),
  receiptFill: document.querySelector("#receiptFill"),
  receiptRate: document.querySelector("#receiptRate"),
  stars: [...document.querySelectorAll("#stars i")],
  scoreNum: document.querySelector("#scoreNum"),
  scoreDrop: document.querySelector("#scoreDrop"),
  scoreStir: document.querySelector("#scoreStir"),
  scorePlate: document.querySelector("#scorePlate"),
  comment: document.querySelector("#resultComment"),
  liveScore: document.querySelector("#liveScore"),
  ringFill: document.querySelector("#ringFill"),
  stirFill: document.querySelector("#stirFill"),
  stirPct: document.querySelector("#stirPct"),
  stirNote: document.querySelector("#stirNote"),
  gestureChip: document.querySelector("#gestureChip"),
  handCount: document.querySelector("#handCount"),
  openFill: document.querySelector("#openFill"),
  pinchFill: document.querySelector("#pinchFill"),
  cam: document.querySelector("#cam"),
  skel: document.querySelector("#skel"),
  camOff: document.querySelector("#camOff"),
  camDot: document.querySelector("#camDot"),
  camState: document.querySelector("#camState"),
  toast: document.querySelector("#toast"),
  handCursor: document.querySelector("#handCursor"),
  cursorLabel: document.querySelector("#cursorLabel"),
  dragGhost: document.querySelector("#dragGhost"),
};

const skelCtx = el.skel.getContext("2d");

const S = {
  phase: "gate",
  roundId: 0,
  inputMode: "mouse",     // mouse | camera
  playing: false,
  cursor: { x: innerWidth / 2, y: innerHeight / 2, tx: 0, ty: 0, visible: false },
  mouse: { x: innerWidth / 2, y: innerHeight / 2, down: false },
  hand: {
    visible: false, lastSeen: 0, count: 0,
    p: 1, open: 0, pinched: false, x: 0, y: 0, fingers: 0,
  },
  digit: { count: 0, since: 0, fired: false },
  pinched: false,
  holding: null,
  selected: DEFAULT_RECIPE,
  recipe: RECIPES[DEFAULT_RECIPE],
  dishCat: RECIPES[DEFAULT_RECIPE].category,
  flow: [],
  stepIdx: 0,
  bucketMax: { drop: 0, craft: 0, season: 0, plate: 0 },
  bucketSteps: { drop: 0, craft: 0, season: 0, plate: 0 },
  ingredients: [...RECIPES[DEFAULT_RECIPE].ingredients],
  remaining: new Set(RECIPES[DEFAULT_RECIPE].ingredients),
  dropped: [],
  score: { drop: 0, craft: 0, season: 0, plate: 0 },
  combo: 0,
  comboBest: 0,
  comboBonus: 0,
  comboTimer: 0,
  stir: freshStir(),
  season: freshSeason(),
  rest: { hold: 0, progress: 0 },
  plate: { hold: 0 },
  records: loadRecords(),
  fire: 0,
  steamAcc: 0,
  toastTimer: 0,
  hudAt: 0,
  camReady: false,
  camStream: null,
  landmarker: null,
  lastDetect: 0,
  visionOk: false,
  camRequested: false,
  setupDone: false,
  lastFrame: performance.now(),
  lastPinchHint: 0,
};

const RING_LEN = 578;

/* ---------------------------- 小工具 ---------------------------- */
function toast(msg, ms = 2200) {
  el.toast.textContent = msg;
  el.toast.classList.add("show");
  clearTimeout(S.toastTimer);
  S.toastTimer = setTimeout(() => el.toast.classList.remove("show"), ms);
}

function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise(resolve => setTimeout(() => resolve("timeout"), ms)),
  ]);
}

function setBadge() {
  el.phaseBadge.textContent = S.inputMode === "camera" ? "摄像头手势" : "鼠标 / 键盘";
}

function setCamState(text, on) {
  el.camState.textContent = text;
  el.camDot.classList.toggle("on", !!on);
}

/* ---------------------------- 菜谱 / 托盘 ---------------------------- */
function buildTray() {
  el.trayList.innerHTML = S.ingredients.map(key => {
    const ing = INGREDIENTS[key];
    return `<button type="button" class="ing-card" data-ing="${key}" aria-label="抓起${ing.name}">
      <span class="ing-art">${ing.art}</span>
      <span class="ing-name">${ing.name}</span>
      <span class="ing-hint">捏合抓取</span>
      <span class="ing-check">✓</span>
    </button>`;
  }).join("");
  el.cards = [...el.trayList.querySelectorAll(".ing-card")];
  el.trayCount.textContent = `0 / ${S.ingredients.length}`;
}

function renderDishOptions() {
  el.dishTabs.innerHTML = CATEGORIES.map(c =>
    `<button type="button" class="dish-tab" data-cat="${c.key}">${c.label}</button>`
  ).join("");
  el.dishOptions.innerHTML = RECIPE_KEYS.map(key => {
    const r = RECIPES[key];
    const dots = r.ingredients.map(k => `<i style="background:${INGREDIENTS[k].dot}"></i>`).join("");
    return `<button type="button" class="dish-option" data-recipe="${key}" data-cat="${r.category}">
      <span class="dish-thumb"><span class="dish-dots">${dots}</span></span>
      <span class="dish-info">
        <strong>${r.name}</strong>
        <em>${r.ingredients.map(k => INGREDIENTS[k].name).join(" · ")}</em>
        <span class="dish-best">未挑战</span>
      </span>
      <span class="dish-select">✓</span>
    </button>`;
  }).join("");

  el.dishTabs.onclick = e => {
    const tab = e.target.closest(".dish-tab");
    if (!tab || S.playing) return;
    clack();
    switchDishCategory(tab.dataset.cat);
  };

  renderDishBest();
  syncDishOptions();
}

function switchDishCategory(cat) {
  S.dishCat = cat;
  if (!RECIPES[S.selected] || RECIPES[S.selected].category !== cat) {
    const first = RECIPE_KEYS.find(k => RECIPES[k].category === cat);
    if (first) applyRecipe(first);
  } else {
    syncDishOptions();
  }
}

function syncDishOptions() {
  [...el.dishOptions.children].forEach(btn => {
    const r = RECIPES[btn.dataset.recipe];
    btn.classList.toggle("is-off", r.category !== S.dishCat);
    btn.classList.toggle("is-selected", btn.dataset.recipe === S.selected);
  });
  [...el.dishTabs.children].forEach(tab => {
    const on = tab.dataset.cat === S.dishCat;
    tab.classList.toggle("is-active", on);
    tab.setAttribute("aria-pressed", on ? "true" : "false");
  });
}

function renderDishBest() {
  [...el.dishOptions.children].forEach(btn => {
    const best = S.records.best[btn.dataset.recipe];
    const tag = btn.querySelector(".dish-best");
    if (tag) tag.textContent = best ? `最佳 ${best}` : "未挑战";
  });
}

function renderBadges() {
  const r = S.records;
  el.badgeList.innerHTML = BADGES.map(b => {
    const on = b.test(r);
    return `<span class="badge${on ? " is-on" : ""}" title="${b.desc}">${b.name}</span>`;
  }).join("");
  el.recordSummary.textContent = r.totalGames
    ? `${r.totalGames} 局 · 最高连击 ${r.maxCombo}`
    : "还没开火";
  renderDishBest();
}

function renderDishShapes(recipe) {
  el.dishShapes.innerHTML = recipe.plate.map(([color, x, y, w, h, r, ring]) => {
    const radius = ring ? "50%" : (h <= 9 ? "6px" : "50%");
    const paint = ring
      ? `background:transparent;border:3px solid ${color};`
      : `background:${color};`;
    return `<span class="dish-shape" style="left:${x}%;top:${y}%;width:${w}%;height:${h}%;transform:rotate(${r}deg);border-radius:${radius};${paint}"></span>`;
  }).join("");
}

function applyRecipe(key) {
  const recipe = RECIPES[key];
  S.selected = key;
  S.recipe = recipe;
  S.dishCat = recipe.category;
  S.ingredients = [...recipe.ingredients];

  const ui = recipeUI(recipe);

  // 解析流程 + 计分桶
  S.flow = resolveFlow(recipe);
  S.stepIdx = 0;
  S.bucketMax = { drop: 0, craft: 0, season: 0, plate: 0 };
  S.bucketSteps = { drop: 0, craft: 0, season: 0, plate: 0 };
  const buckets = flowBuckets(S.flow);
  const weights = bucketWeights(buckets);
  buckets.forEach(b => { S.bucketMax[b] = weights[b]; });
  S.flow.forEach(step => { S.bucketSteps[STEP_BUCKET[step.type]]++; });

  const { accent, deep, soft } = recipe.theme;
  const root = document.documentElement.style;
  root.setProperty("--coral", accent);
  root.setProperty("--coral-deep", deep);
  root.setProperty("--accent-soft", soft);

  el.recipeName.textContent = recipe.name;
  el.recipeTag.textContent = recipe.tagline;
  el.resultDishName.textContent = recipe.name;

  // 顶部步骤条：按 flow 动态渲染
  el.stepper.innerHTML = S.flow.map((step, i) =>
    `<div class="step${i === 0 ? " is-active" : ""}" data-step="${step.type}"><i>${i + 1}</i><span>${step.name}</span></div>`
  ).join("");
  el.steps = [...el.stepper.querySelectorAll(".step")];

  // 开门页步骤简介：pick 步自动拼食材名
  const names = S.ingredients.map(k => INGREDIENTS[k].name).join("、");
  el.gateSteps.innerHTML = S.flow.map((step, i) => {
    const desc = step.type === "pick"
      ? (step.items && step.items.length < S.ingredients.length
        ? `${i === 0 ? "捏合抓起" : "这时再放"}${step.items.map(k => INGREDIENTS[k].name).join("、")}，松开手指${ui.pickVerb}。`
        : `捏合抓起${names}，松开手指${ui.pickVerb}。`)
      : step.desc;
    return `<li><span class="g-ico">${i + 1}</span><div><b>${step.name}</b><p>${desc}</p></div></li>`;
  }).join("");

  // 结算分数行：只渲染本菜存在的环节
  el.resultRows.innerHTML = buckets.map(b =>
    `<div><span>${ui.scoreLabels[b]}</span><b id="${BUCKET_ROW_ID[b]}">--</b></div>`
  ).join("");
  el.scoreDrop = document.querySelector("#scoreDrop");
  el.scoreStir = document.querySelector("#scoreStir");
  el.scoreSeason = document.querySelector("#scoreSeason");
  el.scorePlate = document.querySelector("#scorePlate");

  // 数字键提示按食材数渲染
  if (el.keyDigits) {
    el.keyDigits.innerHTML = S.ingredients.map((_, i) => `<kbd>${i + 1}</kbd>`).join("") +
      `<span>对应食材直接${ui.pickVerb}</span>`;
  }

  syncDishOptions();
  buildTray();
  renderDishShapes(recipe);
  updateStepper();
  updatePhaseUI();
}

/* ---------------------------- 连击 / 调味粒子 ---------------------------- */
function showCombo(n) {
  el.comboNum.textContent = `×${n}`;
  el.comboPop.classList.remove("show");
  void el.comboPop.offsetWidth;
  el.comboPop.classList.add("show");
  blip(720 + Math.min(n, 8) * 34, 0.12, 0.035);
  clearTimeout(S.comboTimer);
  S.comboTimer = setTimeout(() => el.comboPop.classList.remove("show"), 760);
}

function addCombo() {
  S.combo++;
  S.comboBest = Math.max(S.comboBest, S.combo);
  const bonus = Math.min(4, 1 + Math.floor(S.combo / 3));
  S.comboBonus = Math.min(CONFIG.combo.maxBonus, S.comboBonus + bonus);
  if (S.combo >= 2) showCombo(S.combo);
  comboSound(S.combo);
}

function resetCombo() {
  S.combo = 0;
  el.comboPop.classList.remove("show");
}

function spawnSeasonDots(x, y) {
  const r = el.stove.getBoundingClientRect();
  for (let i = 0; i < 3; i++) {
    const dot = document.createElement("i");
    dot.className = "season-dot";
    dot.style.left = `${x - r.left + (Math.random() * 40 - 20)}px`;
    dot.style.top = `${y - r.top + (Math.random() * 14 - 7)}px`;
    dot.style.setProperty("--dx", `${(Math.random() * 26 - 13).toFixed(0)}px`);
    dot.style.animationDelay = `${(i * 0.08).toFixed(2)}s`;
    el.seasonLayer.appendChild(dot);
    setTimeout(() => dot.remove(), 1400);
  }
}

function showCamOff(title, sub, show) {
  el.camOff.classList.toggle("hidden", !show);
  if (show) {
    el.camOff.querySelector("span").textContent = title;
    el.camOff.querySelector("small").textContent = sub;
  }
}

/* ---------------------------- 声音 ---------------------------- */
let audioCtx = null;
let noiseBuffer = null;

function ensureAudio() {
  try {
    if (!audioCtx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      audioCtx = new AC();
      const len = audioCtx.sampleRate * 0.5;
      noiseBuffer = audioCtx.createBuffer(1, len, audioCtx.sampleRate);
      const data = noiseBuffer.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    }
    if (audioCtx.state === "suspended") audioCtx.resume();
  } catch (e) { /* 静默失败即可 */ }
}

function blip(freq = 520, dur = 0.12, gain = 0.05, type = "triangle") {
  if (!audioCtx) return;
  try {
    const t = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    osc.frequency.exponentialRampToValueAtTime(Math.max(80, freq * 1.35), t + dur);
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g).connect(audioCtx.destination);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  } catch (e) { /* ignore */ }
}

function sizzle(dur = 0.32, gain = 0.06) {
  if (!audioCtx || !noiseBuffer) return;
  try {
    const t = audioCtx.currentTime;
    const src = audioCtx.createBufferSource();
    src.buffer = noiseBuffer;
    const filter = audioCtx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.value = 1600;
    filter.Q.value = 0.8;
    const g = audioCtx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(filter).connect(g).connect(audioCtx.destination);
    src.start(t);
    src.stop(t + dur);
  } catch (e) { /* ignore */ }
}

function chime() {
  [523, 659, 784].forEach((f, i) => setTimeout(() => blip(f, 0.18, 0.05, "sine"), i * 120));
}

/* —— 新增音效：全部用 Web Audio API 合成，零外部依赖 —— */

/* 短促咔嗒（按钮 / 菜单项 / tab） */
function clack() {
  if (!audioCtx) return;
  try {
    const t = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    osc.type = "square";
    osc.frequency.setValueAtTime(880, t);
    osc.frequency.exponentialRampToValueAtTime(440, t + 0.05);
    g.gain.setValueAtTime(0.06, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.06);
    osc.connect(g).connect(audioCtx.destination);
    osc.start(t); osc.stop(t + 0.08);
  } catch (e) { /* ignore */ }
}

/* 抓取食材：双音降调，模拟夹取 "咔哒" */
function pickup() {
  if (!audioCtx) return;
  try {
    const t = audioCtx.currentTime;
    [0, 0.05].forEach((delay, i) => {
      const osc = audioCtx.createOscillator();
      const g = audioCtx.createGain();
      osc.type = "triangle";
      osc.frequency.setValueAtTime(i ? 360 : 540, t + delay);
      osc.frequency.exponentialRampToValueAtTime(i ? 220 : 420, t + delay + 0.08);
      g.gain.setValueAtTime(0.055, t + delay);
      g.gain.exponentialRampToValueAtTime(0.0001, t + delay + 0.09);
      osc.connect(g).connect(audioCtx.destination);
      osc.start(t + delay); osc.stop(t + delay + 0.11);
    });
  } catch (e) { /* ignore */ }
}

/* 调味撒料：高频噪声短促调制，类似 shaker 晃动 */
function shake(dur = 0.22) {
  if (!audioCtx || !noiseBuffer) return;
  try {
    const t = audioCtx.currentTime;
    const src = audioCtx.createBufferSource();
    src.buffer = noiseBuffer;
    const lp = audioCtx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.setValueAtTime(4200, t);
    lp.frequency.exponentialRampToValueAtTime(1200, t + dur);
    const g = audioCtx.createGain();
    g.gain.setValueAtTime(0.09, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(lp).connect(g).connect(audioCtx.destination);
    src.start(t); src.stop(t + dur);
    // 叠一个高频小铃铛增加金属感
    const osc = audioCtx.createOscillator();
    const og = audioCtx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(1800, t + dur * 0.4);
    og.gain.setValueAtTime(0.03, t + dur * 0.4);
    og.gain.exponentialRampToValueAtTime(0.0001, t + dur * 0.4 + 0.12);
    osc.connect(og).connect(audioCtx.destination);
    osc.start(t + dur * 0.4); osc.stop(t + dur * 0.4 + 0.14);
  } catch (e) { /* ignore */ }
}

/* 步骤切换 / 装盘落盘：低频钟鸣 ding */
function ding(freq = 320, dur = 0.28, gain = 0.055) {
  if (!audioCtx) return;
  try {
    const t = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g).connect(audioCtx.destination);
    osc.start(t); osc.stop(t + dur + 0.02);
  } catch (e) { /* ignore */ }
}

/* 连击：阶进 tone，越高连击调越高、音量越大 */
function comboSound(n) {
  if (!audioCtx) return;
  try {
    const t = audioCtx.currentTime;
    const base = 440 + Math.min(7, n) * 80;
    const gain = Math.min(0.09, 0.04 + n * 0.008);
    const osc = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(base, t);
    osc.frequency.linearRampToValueAtTime(base * 1.5, t + 0.14);
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
    osc.connect(g).connect(audioCtx.destination);
    osc.start(t); osc.stop(t + 0.18);
  } catch (e) { /* ignore */ }
}

/* auto 模式开关：开启为升短音、暂停为降短音 */
function toggleSound(on) {
  if (!audioCtx) return;
  try {
    const t = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    osc.type = "square";
    osc.frequency.setValueAtTime(on ? 520 : 440, t);
    osc.frequency.linearRampToValueAtTime(on ? 780 : 330, t + 0.09);
    g.gain.setValueAtTime(0.04, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.1);
    osc.connect(g).connect(audioCtx.destination);
    osc.start(t); osc.stop(t + 0.12);
  } catch (e) { /* ignore */ }
}

/* ---------------------------- 摄像头 + 手势库 ---------------------------- */
async function initCamera() {
  try {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return "unsupported";
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { width: CONFIG.camera.width, height: CONFIG.camera.height, facingMode: "user" },
      audio: false,
    });
    el.cam.srcObject = stream;
    S.camStream = stream;
    await el.cam.play();
    S.camReady = true;
    showCamOff("", "", false);
    setCamState("摄像头已连接 · 正在加载识别库", true);
    return "ok";
  } catch (e) {
    const name = e && e.name;
    if (name === "NotAllowedError" || name === "SecurityError") return "denied";
    if (name === "NotFoundError" || name === "OverconstrainedError") return "notfound";
    return "error";
  }
}

function stopCamera() {
  if (S.camStream) {
    S.camStream.getTracks().forEach(t => t.stop());
    S.camStream = null;
  }
  el.cam.srcObject = null;
  S.camReady = false;
}

async function loadVision() {
  try {
    const lib = await import(/* @vite-ignore */ CONFIG.mp.bundle);
    if (!lib.FilesetResolver) throw new Error("bundle 缺少 FilesetResolver");
    const fileset = await lib.FilesetResolver.forVisionTasks(CONFIG.mp.wasm);

    const options = {
      baseOptions: { modelAssetPath: CONFIG.mp.model, delegate: "GPU" },
      runningMode: "VIDEO",
      numHands: 2,
    };

    try {
      S.landmarker = await lib.HandLandmarker.createFromOptions(fileset, options);
    } catch (e) {
      options.baseOptions.delegate = "CPU";
      S.landmarker = await lib.HandLandmarker.createFromOptions(fileset, options);
    }

    S.visionOk = true;
    return true;
  } catch (e) {
    console.error("[手势库]", e);
    S.visionOk = false;
    return false;
  }
}

/* 手势库只加载一次：进选菜页就预下载，点开火时大概率已就绪 */
let visionPromise = null;
function ensureVision() {
  if (!visionPromise) {
    visionPromise = loadVision().then(ok => {
      if (!ok) visionPromise = null; // 失败允许下次重试
      return ok;
    });
  }
  return visionPromise;
}

function enableMouseMode(reason) {
  S.inputMode = "mouse";
  setBadge();
  setCamState("鼠标模式 · 无需摄像头", false);
  showCamOff("已切换到鼠标模式", "拖动食材下锅，在锅里画圈翻炒", true);
  if (reason === "denied" || reason === "notfound" || reason === "error" || reason === "unsupported") {
    toast("摄像头不可用，已切换为鼠标 / 键盘模式", 3800);
  } else if (reason === "model") {
    toast("手势识别库未就绪，已切换为鼠标 / 键盘模式", 3800);
  }
  document.body.classList.add("input-mouse");
  S.cursor.visible = true;
}

async function setupCamera() {
  if (FORCE_MOUSE) {
    enableMouseMode("forced");
    showCamOff("鼠标模式", "拖动食材下锅，在锅里画圈翻炒", true);
    return;
  }

  if (!S.camRequested) {
    S.camRequested = true;
    setCamState("正在请求摄像头权限…", false);
    showCamOff("正在请求摄像头权限…", "请在浏览器弹窗中点击「允许」", true);
  }

  const camResult = await withTimeout(initCamera(), 14000);

  if (camResult !== "ok") {
    const msg = camResult === "timeout" ? "摄像头请求超时" : "摄像头不可用";
    showCamOff(msg, "已切换为鼠标 / 键盘模式", true);
    enableMouseMode(camResult === "timeout" ? "timeout" : camResult);
    return;
  }

  setCamState("正在加载手势识别库…", true);
  el.startHint.textContent = S.visionOk ? "手势库加载中…" : "手势库首次下载约 17MB，请稍候…";
  const ok = await withTimeout(ensureVision(), 60000);

  if (ok === true && S.landmarker) {
    S.inputMode = "camera";
    setBadge();
    setCamState("手势识别已就绪", true);
    showCamOff("", "", false);
    document.body.classList.remove("input-mouse");
    S.cursor.visible = false;
    toast("把手伸进画面 · 捏合抓取食材", 4200);
    el.startHint.textContent = "摄像头手势已就绪";
  } else if (ok === "timeout") {
    enableMouseMode("model");
    setCamState("手势库仍在下载", false);
    showCamOff("手势库正在下载", "首次需下载约 17MB，下载完成后再点一次「开火」即可使用手势", true);
    toast("手势库首次下载较慢，下载完再点一次「开火」就能用手势了", 5200);
  } else {
    showCamOff("手势识别库加载失败", "已切换为鼠标 / 键盘模式", true);
    enableMouseMode("model");
  }
}

/* ---------------------------- 手势检测 ---------------------------- */
const HAND_LINKS = [
  [0, 1], [1, 2], [2, 3], [3, 4], [0, 5], [5, 6], [6, 7], [7, 8],
  [5, 9], [9, 10], [10, 11], [11, 12], [9, 13], [13, 14], [14, 15], [15, 16],
  [13, 17], [17, 18], [18, 19], [19, 20], [0, 17],
];

function handMetrics(lm) {
  const wrist = lm[0];
  const midMcp = lm[9];
  const handSize = Math.hypot(wrist.x - midMcp.x, wrist.y - midMcp.y) + 1e-6;
  const pinchRatio = Math.hypot(lm[4].x - lm[8].x, lm[4].y - lm[8].y) / handSize;
  const p = clamp01((pinchRatio - CONFIG.hand.pinchMin) / (CONFIG.hand.pinchMax - CONFIG.hand.pinchMin));

  const tips = [8, 12, 16, 20];
  const mcps = [5, 9, 13, 17];
  const pips = [6, 10, 14, 18];
  let sum = 0;
  let fingers = 0;
  for (let k = 0; k < 4; k++) {
    const dt = Math.hypot(lm[tips[k]].x - wrist.x, lm[tips[k]].y - wrist.y);
    const dm = Math.hypot(lm[mcps[k]].x - wrist.x, lm[mcps[k]].y - wrist.y) + 1e-6;
    const dp = Math.hypot(lm[pips[k]].x - wrist.x, lm[pips[k]].y - wrist.y) + 1e-6;
    sum += dt / dm;
    if (dt > dp * 1.08) fingers++;
  }
  const open = clamp01((sum / 4 - CONFIG.hand.openMin) / (CONFIG.hand.openMax - CONFIG.hand.openMin));

  return {
    p,
    open,
    fingers,
    x: 1 - midMcp.x,
    y: midMcp.y,
  };
}

function drawSkeleton(lm) {
  const w = el.skel.width, h = el.skel.height;
  skelCtx.clearRect(0, 0, w, h);
  skelCtx.strokeStyle = "#FF6B57";
  skelCtx.fillStyle = "#FF6B57";
  skelCtx.lineWidth = 3;
  skelCtx.lineCap = "round";
  skelCtx.globalAlpha = 0.9;

  for (const [a, b] of HAND_LINKS) {
    skelCtx.beginPath();
    skelCtx.moveTo((1 - lm[a].x) * w, lm[a].y * h);
    skelCtx.lineTo((1 - lm[b].x) * w, lm[b].y * h);
    skelCtx.stroke();
  }
  for (const p of lm) {
    skelCtx.beginPath();
    skelCtx.arc((1 - p.x) * w, p.y * h, 4, 0, TAU);
    skelCtx.fill();
  }
  skelCtx.globalAlpha = 1;
}

function detect(now) {
  if (!S.landmarker || !S.camReady || el.cam.readyState < 2 || now - S.lastDetect < 26) return;
  S.lastDetect = now;

  let res;
  try {
    res = S.landmarker.detectForVideo(el.cam, now);
  } catch (e) {
    return;
  }

  const lms = res.landmarks || [];
  S.hand.count = lms.length;

  if (!lms.length) {
    if (now - S.hand.lastSeen > CONFIG.hand.lostMs) {
      S.hand.visible = false;
    }
    skelCtx.clearRect(0, 0, el.skel.width, el.skel.height);
    return;
  }

  // 多只手时，选最靠近上一帧光标的那只，避免左右手跳变
  let best = null, bestDist = Infinity;
  for (const lm of lms) {
    const m = handMetrics(lm);
    const d = Math.hypot((m.x * innerWidth) - S.cursor.x, (m.y * innerHeight) - S.cursor.y);
    if (d < bestDist) { bestDist = d; best = { lm, m }; }
  }
  if (!best) return;

  drawSkeleton(best.lm);

  S.hand.visible = true;
  S.hand.lastSeen = now;
  S.hand.p = best.m.p;
  S.hand.open = best.m.open;
  S.hand.fingers = best.m.fingers;
  S.hand.x = best.m.x;
  S.hand.y = best.m.y;

  const wasPinched = S.hand.pinched;
  S.hand.pinched = wasPinched ? best.m.p < CONFIG.hand.pinchOff : best.m.p < CONFIG.hand.pinchOn;
}

/* ---------------------------- 数字手势选菜 ---------------------------- */
const DIGIT_HOLD_MS = 550;

function updateDigitGesture(now) {
  const d = S.digit;
  const active = S.playing && S.phase === "pick" && S.inputMode === "camera"
    && S.hand.visible && !S.hand.pinched && S.hand.p > 0.5 && !S.holding;
  const n = active ? S.hand.fingers : 0;
  const type = n >= 1 && n <= S.ingredients.length ? S.ingredients[n - 1] : null;
  if (!type || !S.remaining.has(type) || !pickItems().includes(type)) {
    d.count = 0;
    d.fired = false;
    return;
  }
  if (d.count !== n) {
    d.count = n;
    d.since = now;
    d.fired = false;
    return;
  }
  if (!d.fired && now - d.since >= DIGIT_HOLD_MS) {
    d.fired = true;
    dropIngredient(type, 1, S.cursor.x, S.cursor.y - 20);
  }
}

/* ---------------------------- 光标 ---------------------------- */
function updateCursor(dt) {
  let hasTarget = false;

  if (S.inputMode === "camera") {
    if (S.hand.visible && S.playing) {
      const sx = clamp01(0.5 + (S.hand.x - 0.5) * CONFIG.hand.gainX);
      const sy = clamp01(0.5 + (S.hand.y - 0.5) * CONFIG.hand.gainY);
      S.cursor.tx = sx * innerWidth;
      S.cursor.ty = sy * innerHeight;
      S.cursor.visible = true;
      hasTarget = true;
    } else {
      S.cursor.visible = false;
    }
  } else {
    S.cursor.tx = S.mouse.x;
    S.cursor.ty = S.mouse.y;
    S.cursor.visible = S.playing;
    hasTarget = S.playing;
  }

  if (hasTarget) {
    const k = 1 - Math.exp(-dt / 45);
    S.cursor.x = lerp(S.cursor.x, S.cursor.tx, k);
    S.cursor.y = lerp(S.cursor.y, S.cursor.ty, k);
  }

  el.handCursor.classList.toggle("hidden", !S.cursor.visible);
  if (S.cursor.visible) {
    el.handCursor.style.transform = `translate3d(${S.cursor.x}px, ${S.cursor.y}px, 0)`;
    el.handCursor.classList.toggle("is-pinch", S.pinched);

    let label = "";
    if (S.phase === "pick") {
      if (S.inputMode === "camera" && S.digit.count >= 1 && !S.holding && !S.pinched) {
        const t = S.ingredients[S.digit.count - 1];
        label = t ? (S.digit.fired ? `${INGREDIENTS[t].name} ✓` : `比 ${S.digit.count} · ${INGREDIENTS[t].name}`) : "抓取";
      } else {
        label = S.holding ? "移动" : (S.pinched ? "捏合中" : "抓取");
      }
    }
    else if (S.phase === "stir") label = S.stir.auto ? "自动翻炒" : "画圈";
    else if (S.phase === "season") label = S.season.auto ? "自动调味" : "调味";
    else if (S.phase === "rest") label = "悬停";
    else if (S.phase === "plate") label = "握拳";

    if (S.pinched && S.phase === "pick" && !S.holding) label = "捏合中";
    el.cursorLabel.textContent = label;
  }

  if (S.holding) {
    el.dragGhost.classList.remove("hidden");
    el.dragGhost.style.transform = `translate3d(${S.cursor.x - 28}px, ${S.cursor.y - 28}px, 0)`;
  } else {
    el.dragGhost.classList.add("hidden");
  }
}

/* ---------------------------- 捏合事件 ---------------------------- */
function cardAt(x, y) {
  const pad = 14; // 给手势留一点容错空间，不用精准压中卡片
  for (const card of el.cards) {
    if (card.classList.contains("is-used") || card.classList.contains("is-later")) continue;
    const r = card.getBoundingClientRect();
    if (x >= r.left - pad && x <= r.right + pad && y >= r.top - pad && y <= r.bottom + pad) return card;
  }
  return null;
}

function panMetrics() {
  const r = el.panInner.getBoundingClientRect();
  return {
    rect: r,
    cx: r.left + r.width / 2,
    cy: r.top + r.height / 2,
    radius: r.width / 2,
  };
}

function isOverPan(x, y) {
  const p = panMetrics();
  return Math.hypot(x - p.cx, y - p.cy) < p.radius * 1.2;
}

function startHold(card) {
  const type = card.dataset.ing;
  if (S.phase === "pick" && !pickItems().includes(type)) {
    toast(`${INGREDIENTS[type].name}还不是时候，后面的步骤再放`, 1600);
    return;
  }
  S.holding = { type, card };
  card.classList.add("is-grabbed");
  const art = card.querySelector(".ing-art");
  el.dragGhost.innerHTML = art.innerHTML;
  el.dragGhost.classList.remove("hidden");
  toast(`抓起了${INGREDIENTS[type].name}，移到锅上方松手`, 1800);
  blip(620, 0.1, 0.035);
}

function cancelHold(msg) {
  if (!S.holding) return;
  S.holding.card.classList.remove("is-grabbed");
  S.holding = null;
  el.dragGhost.classList.add("hidden");
  if (msg) toast(msg, 1800);
}

function onPinchStart() {
  if (!S.playing) return;

  if (S.phase === "pick") {
    pickup();
    const card = cardAt(S.cursor.x, S.cursor.y);
    if (card && !S.holding) startHold(card);
    else if (!card && !S.holding && performance.now() - S.lastPinchHint > 2500) {
      S.lastPinchHint = performance.now();
      toast("先把手指移到左侧食材卡片上，再捏合抓取", 1800);
    }
  }
}

function onPinchEnd() {
  if (!S.holding) return;
  const { type, card } = S.holding;

  if (isOverPan(S.cursor.x, S.cursor.y)) {
    const p = panMetrics();
    const d = Math.hypot(S.cursor.x - p.cx, S.cursor.y - p.cy);
    const accuracy = clamp01(1 - d / (p.radius * 0.98));
    S.holding = null;
    el.dragGhost.classList.add("hidden");
    dropIngredient(type, accuracy, S.cursor.x, S.cursor.y);
    return;
  }

  // 鼠标/触屏：在食材卡片上原地松手，视为“先拿起”，可再点锅放下
  if (S.inputMode === "mouse") {
    const r = card.getBoundingClientRect();
    const pad = 10;
    const overOrigin = S.cursor.x >= r.left - pad && S.cursor.x <= r.right + pad
      && S.cursor.y >= r.top - pad && S.cursor.y <= r.bottom + pad;
    if (overOrigin) {
      toast("已经拿在手上，点击锅子放下", 1600);
      return;
    }
  }

  card.classList.remove("is-grabbed");
  S.holding = null;
  el.dragGhost.classList.add("hidden");
  toast("松手的位置不在锅里，再试一次", 1800);
}

/* ---------------------------- 下锅 ---------------------------- */
function spawnPieces(type, fromX, fromY) {
  const p = panMetrics();
  const count = INGREDIENTS[type].pieces;
  const baseSize = clamp(p.rect.width * 0.075, 17, 30);

  for (let i = 0; i < count; i++) {
    const ang = Math.random() * TAU;
    const rr = Math.random() * p.radius * 0.46;
    const size = baseSize * (0.82 + Math.random() * 0.45);
    const fx = p.cx + Math.cos(ang) * rr;
    const fy = p.cy + Math.sin(ang) * rr * 0.8;

    const piece = document.createElement("div");
    piece.className = `piece ${type}`;
    piece.style.width = `${size}px`;
    piece.style.height = `${size}px`;
    piece.style.left = `${fx - p.rect.left - size / 2}px`;
    piece.style.top = `${fy - p.rect.top - size / 2}px`;
    piece.style.setProperty("--r", `${(Math.random() * 60 - 30).toFixed(1)}deg`);
    piece.style.setProperty("--px", `${(Math.random() * 10 - 5).toFixed(1)}px`);
    piece.style.setProperty("--py", `${(-4 - Math.random() * 8).toFixed(1)}px`);
    piece.style.setProperty("--tx", `${(Math.random() * 46 - 23).toFixed(1)}px`);
    piece.style.setProperty("--ty", `${(-38 - Math.random() * 34).toFixed(1)}px`);
    piece.style.animationDelay = `${(Math.random() * 1.2).toFixed(2)}s`;
    el.panInner.appendChild(piece);

    if (piece.animate && Number.isFinite(fromX)) {
      const dx = fromX - fx;
      const dy = fromY - fy;
      piece.animate(
        [
          { transform: `translate(${dx}px, ${dy}px) scale(.55) rotate(-24deg)`, opacity: 0.6 },
          { transform: "translate(0, 0) scale(1) rotate(0deg)", opacity: 1 },
        ],
        { duration: 480 + Math.random() * 160, easing: "cubic-bezier(.2, .9, .3, 1.1)" }
      );
    }
  }
}

/* 托盘锁定状态：非当前 pick 步的食材标为「后放」 */
function refreshTrayLocks() {
  const items = pickItems();
  el.cards.forEach(c => {
    const key = c.dataset.ing;
    const later = S.playing && S.phase === "pick" && S.remaining.has(key) && !items.includes(key);
    c.classList.toggle("is-later", later);
    const hint = c.querySelector(".ing-hint");
    if (hint && !c.classList.contains("is-used")) hint.textContent = later ? "后放" : "捏合抓取";
  });
}

function dropIngredient(type, accuracy, fromX, fromY) {
  if (!S.remaining.has(type) || S.phase !== "pick" || !pickItems().includes(type)) return;

  S.remaining.delete(type);
  S.dropped.push(type);

  const per = S.bucketMax.drop / S.ingredients.length;
  const acc = clamp(0.35 + 0.65 * accuracy, 0, 1);
  S.score.drop = Math.min(S.bucketMax.drop, S.score.drop + Math.round(per * acc));
  if (accuracy >= CONFIG.combo.goodAcc) addCombo();
  else resetCombo();

  const card = el.cards.find(c => c.dataset.ing === type);
  if (card) {
    card.classList.remove("is-grabbed", "is-hover");
    card.classList.add("is-used");
  }

  const p = panMetrics();
  const startX = Number.isFinite(fromX) ? fromX : p.cx + (Math.random() * 30 - 15);
  const startY = Number.isFinite(fromY) ? fromY : p.cy - 20;

  spawnPieces(type, startX, startY);
  spawnSteam(p.cx, p.cy, 3);
  sizzle(0.34, 0.07);
  blip(740, 0.1, 0.04);

  el.trayCount.textContent = `${S.dropped.length} / ${S.ingredients.length}`;
  el.stirNote.textContent = `已下锅 ${S.dropped.length} / ${S.ingredients.length} 样食材`;

  const left = pickItems().filter(t => S.remaining.has(t));
  if (!left.length) {
    const round = S.roundId;
    setTimeout(() => {
      if (round !== S.roundId || S.phase !== "pick") return;
      advanceStep();
    }, 850);
  } else {
    const ui = recipeUI(S.recipe);
    toast(`${INGREDIENTS[type].name}${ui.pickVerb}，本步还差 ${left.length} 样`, 1500);
  }

  updatePhaseUI();
  updateLiveScore();
}

/* ---------------------------- 阶段切换 ---------------------------- */
function stepHint(step) {
  if (step.type === "stir") return `${step.name} · 或按 Space 自动`;
  if (step.type === "season") return `${step.name} · 或按 Space 自动`;
  if (step.type === "rest") return `${step.name} · 悬停等待`;
  if (step.type === "plate") return `${step.name} · 或按 Enter`;
  return step.name;
}

function recordStepScore(bucket, q) {
  const n = Math.max(1, S.bucketSteps[bucket] || 1);
  const per = (S.bucketMax[bucket] || 0) / n;
  S.score[bucket] = Math.min(S.bucketMax[bucket] || 0, S.score[bucket] + Math.round(per * clamp01(q)));
}

function advanceStep() {
  S.stepIdx++;
  if (S.stepIdx >= S.flow.length) return;   // 由 finishPlate 走 done 收尾
  const step = S.flow[S.stepIdx];
  S.phase = step.type;

  S.stir.auto = false;
  S.season.auto = false;
  el.pan.classList.remove("stirring");

  if (step.type === "stir") S.stir = freshStir();
  else if (step.type === "season") S.season = freshSeason();
  else if (step.type === "rest") S.rest = { hold: 0, progress: 0 };
  else if (step.type === "plate") S.plate.hold = 0;

  el.stirNote.textContent = stepHint(step);
  updatePhaseUI();
  updateStepper();
  updateLiveScore();
  refreshTrayLocks();

  const hint = step.type === "rest" ? "（或按 Enter 提前出模）" : step.type === "plate" ? "（或按 Enter）" : step.type === "pick" ? "" : "（或按 Space 自动）";
  toast(`${step.name} · ${step.title || ""}${hint}`, 3000);
  ding(step.type === "rest" ? 260 : 320);
}

function finishStir() {
  if (S.phase !== "stir") return;

  const step = S.flow[S.stepIdx];
  const act = step.action || ACTIONS.circle;
  let q, note;
  if (act.axis) {
    // chop：每往返耗时
    const target = Math.max(1, step.target);
    const per = Math.max(0.3, S.stir.activeMs / 1000) / target;
    if (per < 0.25) q = 0.6;
    else if (per < 0.45) q = 0.88;
    else if (per <= 1.2) q = 1;
    else if (per <= 2) q = 0.78;
    else q = 0.6;
    note = "上下节奏刚好，翻得匀";
    if (q < 1 && per < 0.45) note = "翻得有点急，菜叶还没透";
    else if (q < 1) note = "翻得慢了点，火候要跟上";
  } else if (act.speedTarget != null) {
    // fastCircle / slowCircle：按实际速度 vs speedTarget
    let rps = S.stir.speedAvg;
    if (!rps || S.stir.auto) {
      // 自动模式或无采样：按自动推进的速度估算
      rps = (TAU * step.turns) / Math.max(0.5, (step.autoMs || 4000) / 1000);
    }
    if (act === ACTIONS.fastCircle) {
      if (rps >= 4) q = 1;
      else if (rps >= 2.8) q = 0.85;
      else q = 0.65;
      if (S.stir.auto) q = Math.min(q, 0.8);   // 自动打不到满分
      note = S.stir.auto ? "自动打发，还不够蓬松" :
             (rps >= 4 ? "小圈画得够快，奶油打发到位" : "速度还可以再快些，奶油才会蓬松");
    } else {
      if (rps <= 1.6) q = 1;
      else if (rps <= 2.5) q = 0.82;
      else q = 0.6;
      if (S.stir.auto) q = Math.min(q, 0.8);   // 自动打不到满分
      note = S.stir.auto ? "自动搅拌，还算细腻" :
             (rps <= 1.6 ? "慢速搅拌，蛋液细腻顺滑" : "搅拌急了，蛋液还不够细");
    }
  } else if (act.minRadiusRatio) {
    // bigCircle：每圈耗时，和 circle 类似但要求大圈
    const turns = Math.max(0.5, step.turns);
    const per = Math.max(0.6, S.stir.activeMs / 1000) / turns;
    if (per < 1.1) q = 0.6;
    else if (per < 1.5) q = 0.84;
    else if (per <= 3.25) q = 1;
    else if (per <= 5) q = 0.78;
    else q = 0.6;
    note = "大圈翻炒到位，锅气足";
    if (q < 1 && per < 1.5) note = "大圈有点急，再稳一点";
    else if (q < 1) note = "圈大但慢了，火候要跟上";
  } else {
    // circle（默认）：每圈耗时
    const turns = Math.max(0.5, step.turns);
    const per = Math.max(0.6, S.stir.activeMs / 1000) / turns;
    if (per < 1.1) q = 0.6;
    else if (per < 1.5) q = 0.84;
    else if (per <= 3.25) q = 1;
    else if (per <= 5) q = 0.78;
    else q = 0.6;
    note = "这一步很稳，状态正好";
    if (q < 1 && per < 1.5) note = "动作有点急，慢一点更均匀";
    else if (q < 1) note = "时间略长，动作再紧凑些";
  }

  recordStepScore("craft", q);
  S.stir.auto = false;
  el.pan.classList.remove("stirring");
  el.stirNote.textContent = note;
  advanceStep();
}

function finishSeason() {
  if (S.phase !== "season") return;

  const step = S.flow[S.stepIdx];
  const act = step.action || ACTIONS.sway;
  const target = Math.max(1, step.target);

  let q, note;
  if (act.tap) {
    // tap：按每次捏合耗时
    const per = Math.max(0.2, S.season.activeMs / 1000) / target;
    if (per < 0.18) q = 0.72;
    else if (per < 0.5) q = 1;
    else if (per <= 1.2) q = 0.85;
    else q = 0.7;
    if (S.season.autoUsed) q = Math.min(q, 0.8);
    note = "捏合节奏好，撒料均匀";
    if (q < 1) note = per < 0.3 ? "捏合有点快，料还没撒开" : "捏合慢了点，节奏再紧凑些";
  } else if (act.jitter) {
    // shake：快速抖动，按每次耗时
    const per = Math.max(0.2, S.season.activeMs / 1000) / target;
    if (per < 0.15) q = 0.7;
    else if (per < 0.4) q = 1;
    else if (per <= 1) q = 0.85;
    else q = 0.72;
    if (S.season.autoUsed) q = Math.min(q, 0.8);
    note = "快速抖动，醋和辣椒混得匀";
    if (q < 1) note = per < 0.2 ? "抖得太快，味道还没铺开" : "抖得慢了点，下次紧凑些";
  } else {
    // sway / chop：按每次往返耗时
    const per = Math.max(0.3, S.season.activeMs / 1000) / target;
    if (per < 0.3) q = 0.78;
    else if (per < 0.8) q = 1;
    else if (per <= 1.5) q = 0.85;
    else q = 0.7;
    if (S.season.autoUsed) q = Math.min(q, 0.8);
    note = act.axis === "y" ? "上下移动，糖粉撒得匀" : "节奏正好，味道铺得开";
    if (S.season.autoUsed) note = "自动完成，味道中规中矩";
    else if (per < 0.3) note = "有点急，还没铺开";
    else if (per > 1.2) note = "拖得有点久，下次紧凑些";
  }

  recordStepScore("season", q);
  S.season.auto = false;
  el.stirNote.textContent = note;
  shake();
  advanceStep();
}

function finishRest(fromKey) {
  if (S.phase !== "rest") return;
  recordStepScore("craft", fromKey ? 0.85 : 1);
  el.stirNote.textContent = fromKey ? "提前出模，凝固略欠一点" : "静置到位，凝固刚好";
  advanceStep();
}

function updateSeason(dt) {
  const p = panMetrics();
  let moved = false;
  const step = S.flow[S.stepIdx];
  const act = step.action || ACTIONS.sway;
  const target = Math.max(1, step.target);

  if (S.season.auto) {
    S.season.activeMs += dt;
    S.season.autoAcc += dt;
    const interval = step.autoMs / target;
    if (S.season.autoAcc >= interval) {
      S.season.autoAcc -= interval;
      // 不同动作自动推进不同计数
      if (act.tap) S.season.tapCount++;
      else if (act.jitter) S.season.jitterReversals++;
      else if (act.axis) S.season.reversals++;
      else S.season.reversals++;
      moved = true;
      spawnSeasonDots(p.cx, p.cy);
    }
  } else if (S.cursor.visible) {
    const over = isOverPan(S.cursor.x, S.cursor.y);
    const handOk = S.inputMode === "mouse" || (S.hand.visible && S.hand.open > 0.30);

    // —— tap：检测 pinched 状态切换 ——
    if (act.tap) {
      const down = S.inputMode === "mouse"
        ? S.mouse.down
        : (S.hand.visible && S.hand.pinched);
      if (over && handOk) {
        S.season.activeMs += dt;
        if (down !== S.season.lastPinchWasDown) {
          S.season.lastPinchWasDown = down;
          if (down) {
            S.season.tapCount++;
            moved = true;
            spawnSeasonDots(S.cursor.x, p.cy - p.radius * 0.15);
            addCombo();
          }
        }
      }
    }

    // —— sway / chop（season 时）：左右/上下往返 ——
    if (act.axis && !act.jitter && !act.tap) {
      if (over && handOk) {
        S.season.activeMs += dt;
        const axisVal = act.axis === "y"
          ? (S.cursor.y - p.cy)
          : (S.cursor.x - p.cx);
        const rel = axisVal / p.radius;

        if (S.season.lastAxis == null) {
          S.season.lastAxis = rel;
          S.season.axisPivot = rel;
          S.season.axisDir = 0;
        } else {
          const delta = rel - S.season.lastAxis;
          if (Math.abs(delta) > 0.012) {
            const dir = delta > 0 ? 1 : -1;
            if (S.season.axisDir === 0) {
              S.season.axisDir = dir;
              S.season.axisPivot = rel;
            } else if (dir !== S.season.axisDir) {
              const amp = Math.abs(rel - S.season.axisPivot);
              S.season.axisDir = dir;
              S.season.axisPivot = rel;
              if (amp > (act.axis === "y" ? 0.15 : 0.18)) {
                S.season.reversals++;
                moved = true;
                spawnSeasonDots(S.cursor.x, p.cy - p.radius * 0.15);
                addCombo();
              }
            }
          }
          S.season.lastAxis = rel;
        }
      } else {
        S.season.lastAxis = null;
        S.season.axisDir = 0;
      }
    }

    // —— shake：快速抖动（短时间内高频方向变化，幅度小）——
    if (act.jitter) {
      if (over && handOk) {
        S.season.activeMs += dt;
        const relX = (S.cursor.x - p.cx) / p.radius;
        if (S.season.lastX == null) {
          S.season.lastX = relX;
          S.season.pivot = relX;
          S.season.dir = 0;
        } else {
          const dx = relX - S.season.lastX;
          if (Math.abs(dx) > 0.02) {
            const dir = dx > 0 ? 1 : -1;
            if (S.season.dir === 0) {
              S.season.dir = dir;
              S.season.pivot = relX;
            } else if (dir !== S.season.dir) {
              const amp = Math.abs(relX - S.season.pivot);
              S.season.dir = dir;
              S.season.pivot = relX;
              if (amp > 0.08) {     // shake 幅度要求更小
                S.season.jitterReversals++;
                moved = true;
                spawnSeasonDots(S.cursor.x, p.cy - p.radius * 0.15);
                addCombo();
              }
            }
          }
          S.season.lastX = relX;
        }
      } else {
        S.season.lastX = null;
        S.season.dir = 0;
      }
    }
  }

  // 进度计算
  let progress;
  if (act.tap) progress = clamp01(S.season.tapCount / target);
  else if (act.jitter) progress = clamp01(S.season.jitterReversals / target);
  else progress = clamp01(S.season.reversals / target);
  S.season.progress = progress;

  if (moved) {
    S.fire = lerp(S.fire, 0.2, 0.1);
    el.stove.style.setProperty("--fire", S.fire.toFixed(2));
  }

  el.phaseFill.style.width = `${S.season.progress * 100}%`;
  setRing(S.season.progress);
  el.stirFill.style.width = `${S.season.progress * 100}%`;
  el.stirPct.textContent = `${Math.round(S.season.progress * 100)}%`;
  updateLiveScore();

  if (S.season.progress >= 1) finishSeason();
}

function finishPlate(fromKey) {
  if (S.phase !== "plate") return;

  recordStepScore("plate", fromKey ? 0.85 : 1);
  S.phase = "done";
  S.stir.auto = false;
  el.pan.classList.remove("stirring");
  el.handCursor.classList.add("hidden");
  el.dragGhost.classList.add("hidden");
  S.playing = false;
  document.body.classList.remove("playing");

  showResult();
}

/* ---------------------------- 阶段 UI ---------------------------- */
function updateStepper() {
  const idx = S.phase === "done" ? S.flow.length : S.stepIdx;
  el.steps.forEach((step, i) => {
    step.classList.toggle("is-active", i === idx);
    step.classList.toggle("is-done", i < idx);
  });
}

function stepProgress(step) {
  if (!step) return 0;
  if (step.type === "pick") {
    const items = step.items || S.ingredients;
    const done = items.filter(t => !S.remaining.has(t)).length;
    return items.length ? done / items.length : 0;
  }
  if (step.type === "stir") return S.stir.progress;
  if (step.type === "season") return S.season.progress;
  if (step.type === "rest") return S.rest.progress;
  if (step.type === "plate") return clamp01(S.plate.hold / Math.max(1, step.holdNeed));
  return 0;
}

function updatePhaseUI() {
  const total = S.flow.length || 4;
  const idx = S.phase === "done" ? total : S.stepIdx;
  el.phaseIndex.textContent = `STEP ${Math.min(idx + 1, total)} / ${total}`;
  document.body.dataset.phase = S.phase;

  const ui = recipeUI(S.recipe);
  const step = S.flow[S.stepIdx];

  if (S.phase === "pick") {
    const items = pickItems();
    const left = items.filter(t => S.remaining.has(t)).map(k => INGREDIENTS[k].name);
    const later = S.ingredients.filter(k => S.remaining.has(k) && !items.includes(k)).map(k => INGREDIENTS[k].name);
    el.phaseTitle.textContent = (step && step.title) || (S.dropped.length ? ui.pickAgain : ui.pickTitle);
    const keys = items.map(t => S.ingredients.indexOf(t) + 1).join(" / ");
    const gestureHint = S.inputMode === "camera" ? " 也可以张开手比出数字直接下锅。" : "";
    const laterHint = later.length ? `（${later.join("、")}后面再放）` : "";
    el.phaseDesc.textContent = left.length
      ? `本步放 ${left.join("、")}。${ui.pickDesc.replace("{keys}", keys)}${laterHint}${gestureHint}`
      : "食材都下锅了。";
  } else if (step) {
    el.phaseTitle.textContent = step.title || step.name;
    el.phaseDesc.textContent = step.desc || "";
  }

  const prog = stepProgress(step);
  el.phaseFill.style.width = `${prog * 100}%`;
  setRing(prog);
}

function setRing(progress) {
  const p = clamp01(progress);
  el.ringFill.style.strokeDashoffset = `${RING_LEN * (1 - p)}`;
}

function updateLiveScore() {
  const done = S.score.drop + S.score.craft + S.score.season + S.score.plate;
  let live = done + S.comboBonus;
  const step = S.flow[S.stepIdx];
  if (step && step.type !== "pick") {
    const bucket = STEP_BUCKET[step.type];
    const n = Math.max(1, S.bucketSteps[bucket] || 1);
    const per = (S.bucketMax[bucket] || 0) / n;
    live += Math.round(per * stepProgress(step) * 0.95);
  }
  el.liveScore.textContent = S.phase === "gate" ? "--" : `${live}`;
}

/* ---------------------------- 静置步骤 ---------------------------- */
function updateRest(dt) {
  const step = S.flow[S.stepIdx];
  if (!step) return;
  const ok = S.inputMode === "mouse"
    ? (S.cursor.visible && isOverPan(S.cursor.x, S.cursor.y))
    : (S.hand.visible && S.hand.open > 0.7 && isOverPan(S.cursor.x, S.cursor.y));

  if (ok) S.rest.hold += dt;
  else S.rest.hold = Math.max(0, S.rest.hold - dt * 0.5);
  S.rest.progress = clamp01(S.rest.hold / Math.max(1, step.holdMs));

  el.phaseFill.style.width = `${S.rest.progress * 100}%`;
  setRing(S.rest.progress);
  el.stirFill.style.width = `${S.rest.progress * 100}%`;
  el.stirPct.textContent = `${Math.round(S.rest.progress * 100)}%`;
  updateLiveScore();

  if (S.rest.hold >= step.holdMs) finishRest(false);
}

/* ---------------------------- 每帧游戏逻辑 ---------------------------- */
function updatePinchState() {
  const down = S.inputMode === "mouse"
    ? S.mouse.down
    : (S.hand.visible && S.hand.pinched);

  if (down && !S.pinched) {
    S.pinched = true;
    // 捏合瞬间对齐到真实输入位置，避免平滑拖尾导致点错卡片
    S.cursor.x = S.cursor.tx;
    S.cursor.y = S.cursor.ty;
    onPinchStart();
  } else if (!down && S.pinched) {
    S.pinched = false;
    onPinchEnd();
  }
}

function updateHoverCards() {
  if (S.phase !== "pick" || !S.cursor.visible) {
    el.cards.forEach(c => c.classList.remove("is-hover"));
    return;
  }
  const card = S.holding ? null : cardAt(S.cursor.x, S.cursor.y);
  el.cards.forEach(c => c.classList.toggle("is-hover", c === card));
}

function updateStir(dt, now) {
  const p = panMetrics();
  let moved = false;
  let angSpeed = 0;
  const step = S.flow[S.stepIdx];
  const act = step.action || ACTIONS.circle;

  if (S.stir.auto) {
    // 自动模式：按动作类型匀速推进
    if (act.axis) {
      S.stir.axisReversals += (step.target || 4) * (dt / step.autoMs);
    } else {
      S.stir.total += (TAU * step.turns) * (dt / step.autoMs);
    }
    S.stir.activeMs += dt;
    moved = true;
    angSpeed = 4;
  } else if (S.cursor.visible) {
    const dx = S.cursor.x - p.cx;
    const dy = S.cursor.y - p.cy;
    const r = Math.hypot(dx, dy);
    const handOk = S.inputMode === "mouse"
      ? true
      : (S.hand.visible && S.hand.open > 0.30);

    // —— 画圈类：circle / bigCircle / fastCircle / slowCircle ——
    if (!act.axis) {
      const minR = (act.minRadiusRatio || 0) * p.radius;
      const maxR = p.radius * step.radius;
      if (r > Math.max(12, minR) && r < maxR && handOk) {
        const ang = Math.atan2(dy, dx);
        if (S.stir.lastAngle != null) {
          let delta = ang - S.stir.lastAngle;
          while (delta > Math.PI) delta -= TAU;
          while (delta < -Math.PI) delta += TAU;

          if (Math.abs(delta) >= CONFIG.stir.minStep) {
            S.stir.total += Math.abs(delta);
            S.stir.lastAngle = ang;
            S.stir.activeMs += dt;
            angSpeed = Math.abs(delta) / Math.max(dt / 1000, 0.001);
            moved = Math.abs(delta) > 0.04;
            // 采样速度（圈/秒）用于 fast/slowCircle 评分
            if (moved) {
              const rps = (angSpeed / TAU);
              S.stir.speedSamples.push(rps);
              if (S.stir.speedSamples.length > 20) S.stir.speedSamples.shift();
              S.stir.speedAvg = S.stir.speedSamples.reduce((a, b) => a + b, 0) / S.stir.speedSamples.length;
            }
          }
        } else {
          S.stir.lastAngle = ang;
        }
      } else {
        S.stir.lastAngle = null;
      }
    }

    // —— 上下/左右往返类：chop（stir 时） ——
    if (act.axis) {
      const minR = 0.15 * p.radius;
      if (r > minR && r < p.radius * step.radius && handOk) {
        const axisVal = act.axis === "y" ? (S.cursor.y - p.cy) : (S.cursor.x - p.cx);
        const rel = axisVal / p.radius;

        if (S.stir.lastAxis == null) {
          S.stir.lastAxis = rel;
          S.stir.axisPivot = rel;
          S.stir.axisDir = 0;
        } else {
          const delta = rel - S.stir.lastAxis;
          if (Math.abs(delta) > 0.01) {
            const dir = delta > 0 ? 1 : -1;
            if (S.stir.axisDir === 0) {
              S.stir.axisDir = dir;
              S.stir.axisPivot = rel;
            } else if (dir !== S.stir.axisDir) {
              const amp = Math.abs(rel - S.stir.axisPivot);
              S.stir.axisDir = dir;
              S.stir.axisPivot = rel;
              if (amp > 0.15) {
                S.stir.axisReversals++;
                moved = true;
                angSpeed = 5;
              }
            }
          }
          S.stir.lastAxis = rel;
          if (moved) S.stir.activeMs += dt;
        }
      } else {
        S.stir.lastAxis = null;
        S.stir.axisDir = 0;
      }
    }
  } else {
    S.stir.lastAngle = null;
    S.stir.lastAxis = null;
  }

  // 进度
  if (act.axis) {
    S.stir.progress = clamp01(S.stir.axisReversals / step.target);
  } else {
    S.stir.progress = clamp01(S.stir.total / (TAU * step.turns));
  }

  const fireTarget = moved ? clamp01(0.35 + Math.min(1, angSpeed / 12) * 0.65) : 0.12;
  S.fire = lerp(S.fire, fireTarget, 1 - Math.exp(-dt / 45));
  el.stove.style.setProperty("--fire", S.fire.toFixed(2));

  if (moved) {
    el.pan.classList.add("stirring");
    el.steamAcc += dt;
    const interval = 200 - S.stir.progress * 90;
    if (el.steamAcc > interval) {
      el.steamAcc = 0;
      spawnSteam(p.cx, p.cy, 1);
    }
  }

  el.phaseFill.style.width = `${S.stir.progress * 100}%`;
  setRing(S.stir.progress);
  el.stirFill.style.width = `${S.stir.progress * 100}%`;
  el.stirPct.textContent = `${Math.round(S.stir.progress * 100)}%`;

  updateLiveScore();

  if (S.stir.progress >= 1) {
    finishStir();
  }
}

function updatePlate(dt) {
  let fist = false;

  if (S.inputMode === "camera") {
    fist = S.hand.visible && S.hand.open < CONFIG.plate.fistOpen;
  } else {
    fist = S.mouse.down;
  }

  if (fist) {
    S.plate.hold += dt;
  } else {
    S.plate.hold = Math.max(0, S.plate.hold - dt * 2.2);
  }

  const step = S.flow[S.stepIdx];
  const holdNeed = step.holdNeed;
  el.phaseFill.style.width = `${clamp01(S.plate.hold / holdNeed) * 100}%`;
  setRing(clamp01(S.plate.hold / holdNeed));

  if (S.plate.hold >= holdNeed) {
    finishPlate(false);
  }
}

function spawnSteam(cx, cy, count = 1) {
  for (let i = 0; i < count; i++) {
    const s = document.createElement("div");
    s.className = "steam";
    const size = 10 + Math.random() * 16;
    s.style.width = `${size}px`;
    s.style.height = `${size}px`;
    s.style.left = `${cx - el.stove.getBoundingClientRect().left + (Math.random() * 70 - 35)}px`;
    s.style.top = `${cy - el.stove.getBoundingClientRect().top + (Math.random() * 20 - 10)}px`;
    s.style.setProperty("--sx", `${(Math.random() * 70 - 35).toFixed(0)}px`);
    el.steam.appendChild(s);
    setTimeout(() => s.remove(), 2500);
  }
}

/* ---------------------------- HUD ---------------------------- */
function updateHUD(now) {
  if (now - S.hudAt < 70) return;
  S.hudAt = now;

  el.openFill.style.width = `${S.hand.open * 100}%`;
  el.pinchFill.style.width = `${(1 - S.hand.p) * 100}%`;

  if (S.inputMode === "mouse") {
    el.handCount.textContent = "鼠标输入";
    el.gestureChip.className = "gesture-chip";
    el.gestureChip.innerHTML = "<b>鼠标模式</b><em>拖动食材 / 在锅里画圈</em>";
    el.openFill.style.width = S.playing ? "100%" : "0%";
    el.pinchFill.style.width = S.mouse.down ? "100%" : "0%";
    return;
  }

  el.handCount.textContent = `${S.hand.count} 只手`;

  if (!S.hand.visible) {
    el.gestureChip.className = "gesture-chip";
    el.gestureChip.innerHTML = "<b>等待手掌</b><em>把手放进画面</em>";
    return;
  }

  let cls = "";
  let title = "半握";
  let sub = "张开或捏合试试";

  if (S.hand.pinched || S.hand.p < 0.32) {
    cls = "is-pinch";
    title = "捏合中";
    sub = "拇指与食指已经靠在一起";
  } else if (S.hand.open > 0.58) {
    cls = "is-open";
    title = "张开手掌";
    sub = "正在炒菜的好姿势";
  } else if (S.hand.open < CONFIG.plate.fistOpen) {
    cls = "is-pinch";
    title = "握拳";
    sub = "保持一下就能出锅";
  }

  el.gestureChip.className = `gesture-chip ${cls}`;
  el.gestureChip.innerHTML = `<b>${title}</b><em>${sub}</em>`;
}

/* ---------------------------- 键盘 ---------------------------- */
function onKeyDown(e) {
  if (!S.playing) return;

  const digit = /^[1-9]$/.test(e.key) ? Number(e.key)
    : /^(Digit|Numpad)[1-9]$/.test(e.code) ? Number(e.code.slice(-1)) : 0;
  if (digit) {
    const idx = digit - 1;
    const type = S.ingredients[idx];
    if (S.phase === "pick" && type && S.remaining.has(type)) {
      if (!pickItems().includes(type)) {
        toast(`${INGREDIENTS[type].name}还不是时候，后面的步骤再放`, 1600);
      } else {
        const p = panMetrics();
        dropIngredient(type, 1, p.cx, p.cy - 24);
      }
      e.preventDefault();
    }
    return;
  }

  if (e.code === "Space" || e.key === " ") {
    const step = S.flow[S.stepIdx];
    if (S.phase === "stir") {
      S.stir.auto = !S.stir.auto;
      toggleSound(S.stir.auto);
      el.stirNote.textContent = S.stir.auto
        ? `自动${step ? step.name : "翻炒"}中… 再按一次 Space 暂停`
        : `${step ? step.title : "画圈翻炒"}，或按 Space 自动`;
      toast(S.stir.auto ? "自动翻炒开启" : "自动翻炒暂停", 1400);
      e.preventDefault();
    } else if (S.phase === "season") {
      S.season.auto = !S.season.auto;
      toggleSound(S.season.auto);
      if (S.season.auto) S.season.autoUsed = true;
      el.stirNote.textContent = S.season.auto
        ? "自动调味中… 再按一次 Space 暂停"
        : `${step ? step.title : "在锅上方晃动调味"}，或按 Space 自动`;
      toast(S.season.auto ? "自动调味开启" : "自动调味暂停", 1400);
      e.preventDefault();
    } else if (S.phase === "rest") {
      finishRest(true);
      e.preventDefault();
    }
    return;
  }

  if (e.code === "Enter" || e.code === "NumpadEnter") {
    if (S.phase === "plate") {
      finishPlate(true);
      e.preventDefault();
    } else if (S.phase === "rest") {
      finishRest(true);
      e.preventDefault();
    }
  }
}

/* ---------------------------- 鼠标 ---------------------------- */
function bindEvents() {
  el.dishOptions.addEventListener("click", e => {
    const btn = e.target.closest(".dish-option");
    if (!btn || !RECIPES[btn.dataset.recipe]) return;
    clack();
    applyRecipe(btn.dataset.recipe);
    ensureAudio();
  });

  el.startBtn.addEventListener("click", async () => {
    if (el.startBtn.disabled) return;
    el.startBtn.disabled = true;
    el.startHint.textContent = "正在准备灶台…";
    ensureAudio();
    clack();
    el.gate.classList.add("is-hidden");
    document.body.classList.add("playing");

    startGame();
    el.startBtn.blur();

    if (!S.setupDone) {
      await setupCamera();
      S.setupDone = true;
    } else if (S.inputMode === "camera") {
      toast("把手伸进画面，继续下厨", 2200);
    }
  });

  el.againBtn.addEventListener("click", () => {
    el.againBtn.blur();
    clack();
    document.body.classList.add("playing");
    if (S.inputMode === "mouse") document.body.classList.add("input-mouse");
    resetGame();
  });

  el.switchBtn.addEventListener("click", () => {
    el.switchBtn.blur();
    clack();
    showDishGate();
  });

  window.addEventListener("keydown", onKeyDown);

  window.addEventListener("pointermove", e => {
    if (S.inputMode !== "mouse") return;
    S.mouse.x = e.clientX;
    S.mouse.y = e.clientY;
  });

  window.addEventListener("pointerdown", e => {
    if (S.inputMode !== "mouse" || !S.playing) return;
    S.mouse.x = e.clientX;
    S.mouse.y = e.clientY;
    S.cursor.tx = e.clientX;
    S.cursor.ty = e.clientY;
    S.cursor.x = e.clientX;
    S.cursor.y = e.clientY;

    const card = e.target.closest && e.target.closest(".ing-card");
    if (card && S.phase === "pick" && !card.classList.contains("is-used")) {
      S.mouse.down = true;
      updatePinchState();
      return;
    }
    if (S.phase === "pick" && S.holding) {
      S.mouse.down = true;
      updatePinchState();
      return;
    }
    if (S.phase === "stir" || S.phase === "season" || S.phase === "plate") {
      S.mouse.down = true;
      updatePinchState();
    }
  });

  window.addEventListener("pointerup", e => {
    if (S.inputMode !== "mouse") return;
    S.mouse.x = e.clientX;
    S.mouse.y = e.clientY;
    S.cursor.x = e.clientX;
    S.cursor.y = e.clientY;
    S.mouse.down = false;
    updatePinchState();
  });

  window.addEventListener("pointercancel", () => {
    S.mouse.down = false;
    updatePinchState();
  });

  window.addEventListener("blur", () => {
    S.mouse.down = false;
    S.stir.auto = false;
  });

  document.addEventListener("contextmenu", e => {
    if (S.playing) e.preventDefault();
  });
}

/* ---------------------------- 游戏流程 ---------------------------- */
function startGame() {
  S.roundId++;
  applyRecipe(S.selected);
  S.phase = "pick";
  S.playing = true;
  S.cursor.visible = true;
  S.score = { drop: 0, craft: 0, season: 0, plate: 0 };
  S.combo = 0;
  S.comboBest = 0;
  S.comboBonus = 0;
  S.stepIdx = 0;
  S.stir = freshStir();
  S.season = freshSeason();
  S.rest = { hold: 0, progress: 0 };
  S.digit = { count: 0, since: 0, fired: false };
  S.plate.hold = 0;
  el.comboPop.classList.remove("show");
  el.seasonLayer.innerHTML = "";
  S.fire = 0;
  S.steamAcc = 0;
  S.holding = null;
  S.dropped = [];
  S.remaining = new Set(S.ingredients);
  S.mouse.down = false;
  document.body.classList.toggle("input-mouse", S.inputMode === "mouse");

  el.cards.forEach(c => c.classList.remove("is-used", "is-grabbed", "is-hover"));
  refreshTrayLocks();
  [...el.panInner.querySelectorAll(".piece")].forEach(p => p.remove());
  el.pan.classList.remove("stirring");
  el.stove.style.setProperty("--fire", "0");

  el.trayCount.textContent = `0 / ${S.ingredients.length}`;
  el.stirFill.style.width = "0%";
  el.stirPct.textContent = "0%";
  el.stirNote.textContent = "食材下锅后开始计圈";
  el.result.classList.add("hidden");
  setRing(0);
  updateStepper();
  updatePhaseUI();
  updateLiveScore();
  toast(`今天做${S.recipe.name} · ${recipeUI(S.recipe).pickTitle}`, 2600);
  blip(520, 0.14, 0.04);
}

function resetGame() {
  S.roundId++;
  S.playing = true;
  S.phase = "pick";
  S.holding = null;
  S.score = { drop: 0, craft: 0, season: 0, plate: 0 };
  S.combo = 0;
  S.comboBest = 0;
  S.comboBonus = 0;
  S.stepIdx = 0;
  S.stir = freshStir();
  S.season = freshSeason();
  S.rest = { hold: 0, progress: 0 };
  S.digit = { count: 0, since: 0, fired: false };
  S.plate.hold = 0;
  el.comboPop.classList.remove("show");
  el.seasonLayer.innerHTML = "";
  S.fire = 0;
  S.steamAcc = 0;
  S.dropped = [];
  S.remaining = new Set(S.ingredients);
  S.mouse.down = false;

  el.result.classList.add("hidden");
  el.cards.forEach(c => c.classList.remove("is-used", "is-grabbed", "is-hover"));
  refreshTrayLocks();
  [...el.panInner.querySelectorAll(".piece")].forEach(p => p.remove());
  el.pan.classList.remove("stirring");
  el.stove.style.setProperty("--fire", "0");

  el.trayCount.textContent = `0 / ${S.ingredients.length}`;
  el.stirFill.style.width = "0%";
  el.stirPct.textContent = "0%";
  el.stirNote.textContent = "食材下锅后开始计圈";
  el.liveScore.textContent = "0";
  el.handCursor.classList.remove("hidden");

  setRing(0);
  updateStepper();
  updatePhaseUI();
  toast(`再做一份${S.recipe.name}`, 2000);
}

function showDishGate() {
  S.roundId++;
  S.playing = false;
  S.phase = "gate";
  S.holding = null;
  S.stir.auto = false;
  S.mouse.down = false;

  el.result.classList.add("hidden");
  el.gate.classList.remove("is-hidden");
  el.handCursor.classList.add("hidden");
  el.dragGhost.classList.add("hidden");
  document.body.classList.remove("playing", "input-mouse");

  el.startBtn.disabled = false;
  el.startText.textContent = "开 火 下 厨";
  el.startHint.textContent = S.setupDone ? "选好菜后继续开火" : "点击后请求摄像头";
  renderBadges();

  [...el.panInner.querySelectorAll(".piece")].forEach(p => p.remove());
  el.pan.classList.remove("stirring");
  el.stove.style.setProperty("--fire", "0");
  el.cards.forEach(c => c.classList.remove("is-used", "is-grabbed", "is-hover"));
  refreshTrayLocks();
  el.trayCount.textContent = `0 / ${S.ingredients.length}`;
  setRing(0);

  // 在选菜页就预下载手势库，点开火时直接可用
  if (!S.visionOk) ensureVision();
}

function showResult() {
  const base = S.score.drop + S.score.craft + S.score.season + S.score.plate;
  const total = clamp(base + S.comboBonus, 0, 120);
  const stars = total >= 90 ? 3 : total >= 70 ? 2 : 1;

  el.scoreNum.textContent = `${total}`;
  if (el.scoreDrop) el.scoreDrop.textContent = `${S.score.drop} / ${S.bucketMax.drop}`;
  if (el.scoreStir) el.scoreStir.textContent = `${S.score.craft} / ${S.bucketMax.craft}`;
  if (el.scoreSeason) el.scoreSeason.textContent = `${S.score.season} / ${S.bucketMax.season}`;
  if (el.scorePlate) el.scorePlate.textContent = `${S.score.plate} / ${S.bucketMax.plate}`;

  el.stars.forEach((s, i) => s.classList.toggle("on", i < stars));

  let comment;
  if (total >= 105) comment = `${S.recipe.flavor} 教科书级出锅，火候和手感都漂亮。`;
  else if (total >= 90) comment = `${S.recipe.flavor} 这一盘可以端上桌了。`;
  else if (total >= 72) comment = "家常味道不错，再把火候和手势稳住一点会更香。";
  else if (total >= 52) comment = "能吃！不过锅铲还不太听话，再来一份找找手感。";
  else comment = "厨房小事故，先练练捏合和画圈，再开一次火吧。";

  el.comment.textContent = comment;
  el.comboLine.textContent = `最高连击 ${S.comboBest} · 加成 +${S.comboBonus}`;

  // 纪录与成就
  const key = S.selected;
  const prevBest = S.records.best[key] || 0;
  const isNewBest = total > prevBest;
  if (isNewBest) S.records.best[key] = total;
  S.records.plays[key] = (S.records.plays[key] || 0) + 1;
  S.records.totalGames += 1;
  S.records.maxCombo = Math.max(S.records.maxCombo, S.comboBest);
  saveRecords();
  renderBadges();

  el.recordLine.textContent = isNewBest
    ? `新纪录 · 本菜最佳 ${total}`
    : `本菜最佳 ${S.records.best[key]}`;

  // 食客小票
  const guest = GUESTS[(RECIPE_KEYS.indexOf(key) + Math.round(total)) % GUESTS.length];
  const tier = total >= 95 ? "high" : total >= 72 ? "mid" : "low";
  const rate = clamp(Math.round(42 + total * 0.47), 40, 99);

  el.receiptNo.textContent = `#${((S.records.totalGames * 37 + 1043) % 9000 + 1000)}`;
  el.receiptAvatar.textContent = guest.initial;
  el.receiptGuest.textContent = guest.name;
  el.receiptTable.textContent = guest.table;
  el.receiptComment.textContent = guest[tier];
  el.receiptRate.textContent = `${rate}%`;
  el.receiptFill.style.width = `${rate}%`;

  el.result.classList.remove("hidden");
  S.playing = false;
  document.body.classList.remove("playing", "input-mouse");
  el.liveScore.textContent = `${total}`;
  chime();
}

/* ---------------------------- 主循环 ---------------------------- */
function tick(now) {
  requestAnimationFrame(tick);

  const dt = Math.min(50, Math.max(0, now - S.lastFrame));
  S.lastFrame = now;

  if (S.playing && S.camReady && S.landmarker && S.visionOk) {
    detect(now);
  }

  updateCursor(dt);
  updatePinchState();
  updateHoverCards();

  if (S.playing) {
    if (S.phase === "stir") updateStir(dt, now);
    else if (S.phase === "season") updateSeason(dt);
    else if (S.phase === "rest") updateRest(dt);
    else if (S.phase === "plate") updatePlate(dt);
    else if (S.phase === "pick" && S.holding) {
      S.fire = lerp(S.fire, 0.06, 1 - Math.exp(-dt / 120));
      el.stove.style.setProperty("--fire", S.fire.toFixed(2));
    }
    updateDigitGesture(now);
    updateHUD(now);
  } else if (S.phase === "done") {
    S.fire = lerp(S.fire, 0, 0.1);
    el.stove.style.setProperty("--fire", S.fire.toFixed(2));
  }
}

/* ---------------------------- 初始化 ---------------------------- */
renderDishOptions();
applyRecipe(DEFAULT_RECIPE);
renderBadges();
bindEvents();
setBadge();
requestAnimationFrame(tick);
