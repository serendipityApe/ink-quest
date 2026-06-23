import type { Lang } from "@/types/story";

/**
 * 轻量界面多语言：仅翻译 UI chrome（导航/按钮/提示），不引第三方库。
 * 界面语言与「学习的目标语言」完全解耦 —— 选中文界面也能学中文。
 *
 * 用法（客户端组件）：
 *   const t = useTranslations();
 *   t("nav.stories")
 */

export const UI_LANGS: Lang[] = ["en", "zh"];

export const DICTS = {
  en: {
    "nav.stories": "Stories",
    "nav.pricing": "Pricing",
    "nav.signIn": "Sign In",
    "nav.signOut": "Sign Out",
    "nav.learning": "Learning",
    "lang.zh": "中文",
    "lang.en": "English",
    "stories.title": "Choose your next destiny.",
    "stories.welcome": "Welcome back, Learner.",
    "stories.search": "Search stories...",
    "stories.explored": "Explored",
    "stories.all": "All",
    "stories.level": "Level",
    "stories.recent": "Recent Adventures",
    "stories.progress": "Progress",
    "stories.notStarted": "Not started",
    "stories.locked": "Premium Locked",
    "stories.empty": "No stories found matching your filter criteria.",
    "stories.clear": "Clear all filters",
    "stories.viewLibrary": "View Library",
    "reader.map": "Path Map",
    "reader.listen": "Listen Narration",
    "reader.stopListen": "Stop Listening",
    "reader.playSentence": "Play sentence",
    "reader.resumed": "Resumed your last reading position",
    "reader.backToLibrary": "Back to library",
    "reader.loadError": "Failed to load. Please refresh.",
    "storyMap.hint": "Lit nodes are clickable to revisit; question marks are branches not yet unlocked.",
    "storyMap.current": "Current",
    "storyMap.unlocked": "Unlocked (tap to jump)",
    "storyMap.locked": "Locked",
    "storyMap.ending": "Ending",
    "savedWords.title": "Saved Words",
    "savedWords.empty": "No saved words yet.",
    "savedWords.browse": "Browse Stories",
    "common.save": "Save",
    "common.saved": "Saved",
  },
  zh: {
    "nav.stories": "故事库",
    "nav.pricing": "会员",
    "nav.signIn": "登录",
    "nav.signOut": "退出",
    "nav.learning": "正在学",
    "lang.zh": "中文",
    "lang.en": "English",
    "stories.title": "选择你的下一段冒险。",
    "stories.welcome": "欢迎回来，学习者。",
    "stories.search": "搜索故事…",
    "stories.explored": "已探索",
    "stories.all": "全部",
    "stories.level": "等级",
    "stories.recent": "最近的冒险",
    "stories.progress": "进度",
    "stories.notStarted": "未开始",
    "stories.locked": "会员专享",
    "stories.empty": "没有符合筛选条件的故事。",
    "stories.clear": "清除筛选",
    "stories.viewLibrary": "查看全部",
    "reader.map": "路径图",
    "reader.listen": "朗读旁白",
    "reader.stopListen": "停止朗读",
    "reader.playSentence": "播放此句",
    "reader.resumed": "已恢复到上次阅读位置",
    "reader.backToLibrary": "返回故事库",
    "reader.loadError": "加载失败，请刷新重试。",
    "storyMap.hint": "点亮的节点可点击跳回重读，问号为尚未解锁的分支。",
    "storyMap.current": "当前位置",
    "storyMap.unlocked": "已解锁（可跳转）",
    "storyMap.locked": "未解锁",
    "storyMap.ending": "结局",
    "savedWords.title": "生词本",
    "savedWords.empty": "还没有收藏的词。",
    "savedWords.browse": "浏览故事",
    "common.save": "收藏",
    "common.saved": "已收藏",
  },
} as const;

export type TranslationKey = keyof (typeof DICTS)["en"];

export function translate(lang: Lang, key: TranslationKey): string {
  return DICTS[lang]?.[key] ?? DICTS.en[key] ?? key;
}
