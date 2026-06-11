"use client";

import { use, useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Volume2, Square, Bookmark, BookmarkCheck, Lock } from "lucide-react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import SubscribeModal from "@/components/SubscribeModal";

// Definition of story paths and choices
interface StoryNode {
  text: string;
  translations: {
    [word: string]: {
      pinyin: string;
      meaning: string;
      level?: string;
    };
  };
  choices: {
    text: string;
    nextNodeId: string;
    premium?: boolean;
  }[];
}

interface StoryData {
  titleCn: string;
  titleEn: string;
  level: string;
  nodes: {
    [nodeId: string]: StoryNode;
  };
}

const STORY_REGISTRY: { [storyId: string]: StoryData } = {
  "master-secret": {
    titleCn: "师尊的秘密",
    titleEn: "The Secret of the Master",
    level: "HSK 4",
    nodes: {
      start: {
        text: "你推开房门，只见屋内寒气森森，空气中弥漫着一种诡异的香气。",
        translations: {
          "诡异": { pinyin: "guǐ yì", meaning: "strange; weird; eerie", level: "HSK 4" }
        },
        choices: [
          { text: "A. 潜入师尊房间", nextNodeId: "sneak" },
          { text: "B. 在丹房外等待", nextNodeId: "wait" },
          { text: "C. 离开此地", nextNodeId: "leave" }
        ]
      },
      sneak: {
        text: "你悄悄推门而入，屋内陈设简朴，案几上放着一尊青铜炼丹炉，炉底微温，似有余烬。你走近一看，炉中有些丹药发着幽绿的光。",
        translations: {
          "炼丹炉": { pinyin: "liàn dān lú", meaning: "alchemy furnace", level: "HSK 5" },
          "丹药": { pinyin: "dān yào", meaning: "alchemy pill; medicine", level: "HSK 4" }
        },
        choices: [
          { text: "A1. 伸手拿取绿丹 [Premium]", nextNodeId: "premium_pills", premium: true },
          { text: "A2. 翻看桌上的手札", nextNodeId: "read_notes" },
          { text: "A3. 听到脚步声，赶紧躲起来", nextNodeId: "hide" }
        ]
      },
      wait: {
        text: "你在丹房外默默站立，寒风刺骨。过了一会儿，突然听到里面传来一声低沉的叹息，接着门被缓缓拉开，一个冰冷的声音传来：‘你来这里做什么？’",
        translations: {
          "叹息": { pinyin: "tàn xī", meaning: "sigh", level: "HSK 4" }
        },
        choices: [
          { text: "B1. 躬身向师尊行礼", nextNodeId: "bow" },
          { text: "B2. 拔剑戒备 [Premium]", nextNodeId: "premium_sword", premium: true }
        ]
      },
      leave: {
        text: "你摇了摇头，决定不趟这趟浑水。你转身离去，走在幽静的石板路上。突然，背后传来一声冷哼：‘既然来了，何必急着走？’",
        translations: {
          "浑水": { pinyin: "hún shuǐ", meaning: "muddy water; trouble", level: "HSK 5" }
        },
        choices: [
          { text: "C1. 回头认错解释", nextNodeId: "explain" },
          { text: "C2. 施展轻功逃跑 [Premium]", nextNodeId: "premium_run", premium: true }
        ]
      },
      read_notes: {
        text: "你翻开古旧的手札，上面用草书写着：‘逆天改命者，必遭天劫。九转还魂丹需以极阴之血炼制……’你心中震惊，原来师尊的丹药竟是用邪术制成！",
        translations: {
          "天劫": { pinyin: "tiān jié", meaning: "heavenly tribulation", level: "HSK 6" },
          "邪术": { pinyin: "xié shù", meaning: "sorcery; evil magic", level: "HSK 5" }
        },
        choices: [
          { text: "[ 返回故事列表 ]", nextNodeId: "end_back_to_list" }
        ]
      },
      hide: {
        text: "你迅速闪身躲到巨大的青铜鼎后。房门吱呀一声被推开，一个穿着白衣的身影走了进来。他走到案几旁，看着丹炉，自言自语道：‘又失败了么……’",
        translations: {
          "自言自语": { pinyin: "zì yán zì yǔ", meaning: "talk to oneself", level: "HSK 4" }
        },
        choices: [
          { text: "[ 返回故事列表 ]", nextNodeId: "end_back_to_list" }
        ]
      },
      bow: {
        text: "你深吸一口气，躬身行礼：‘师尊，弟子在修炼中遇到疑惑，特来请教。’白衣人看了你一眼，眼中的冰冷融化了少许：‘进来吧。’",
        translations: {
          "疑惑": { pinyin: "yí huò", meaning: "doubt; perplexity", level: "HSK 4" }
        },
        choices: [
          { text: "[ 返回故事列表 ]", nextNodeId: "end_back_to_list" }
        ]
      },
      explain: {
        text: "你停下脚步，转过身行礼道：‘弟子只是路过此处，打扰了师尊清修，万望恕罪。’冷哼声的主人缓缓走近：‘路过？你觉得老夫会信吗？’",
        translations: {
          "恕罪": { pinyin: "shù zuì", meaning: "forgive a crime/mistake", level: "HSK 5" }
        },
        choices: [
          { text: "[ 返回故事列表 ]", nextNodeId: "end_back_to_list" }
        ]
      }
    }
  },
  "lost-letter": {
    titleCn: "遗失的信",
    titleEn: "The Lost Letter",
    level: "HSK 3",
    nodes: {
      start: {
        text: "在书房的角落里，你发现了一封被遗忘的信。信封已经泛黄，上面的字迹有些模糊。",
        translations: {
          "遗忘": { pinyin: "yí wàng", meaning: "forget; neglect", level: "HSK 3" },
          "模糊": { pinyin: "mó hu", meaning: "blurry; vague", level: "HSK 4" }
        },
        choices: [
          { text: "A. 拆开信封", nextNodeId: "open" },
          { text: "B. 将信放回原处", nextNodeId: "put_back" },
          { text: "C. 拿去询问管家 [Premium]", nextNodeId: "premium_butler", premium: true }
        ]
      },
      open: {
        text: "你拆开信，信纸上写着：‘当你看到这封信时，我已经离开。切记，不要去寻找那座古墓……’信里还夹着一张破碎的地图。",
        translations: {
          "古墓": { pinyin: "gǔ mù", meaning: "ancient tomb", level: "HSK 5" },
          "地图": { pinyin: "dì tú", meaning: "map", level: "HSK 3" }
        },
        choices: [
          { text: "A1. 研究地图路线", nextNodeId: "study_map" },
          { text: "A2. 烧毁信件 [Premium]", nextNodeId: "premium_burn", premium: true }
        ]
      },
      put_back: {
        text: "你决定不干涉他人的隐私，把信放回原处。就在你转头的一瞬间，书架后面传来一阵轻微的响动……",
        translations: {
          "响动": { pinyin: "xiǎng dòng", meaning: "sound; noise", level: "HSK 4" }
        },
        choices: [
          { text: "B1. 大声喝问是谁", nextNodeId: "who_is_there" },
          { text: "B2. 悄悄走过去察看", nextNodeId: "inspect" }
        ]
      },
      study_map: {
        text: "你仔细端详这张残缺的地图，发现它标注的终点指向学校后山的深谷。那里终年大雾笼罩，被称为迷失之地。你握紧了拳头，决定出发去查探真相。",
        translations: {
          "深谷": { pinyin: "shēn gǔ", meaning: "deep valley", level: "HSK 4" },
          "大雾": { pinyin: "dà wù", meaning: "heavy fog", level: "HSK 3" }
        },
        choices: [
          { text: "[ 返回故事列表 ]", nextNodeId: "end_back_to_list" }
        ]
      },
      who_is_there: {
        text: "你大喝一声：‘谁在那儿！出来！’响动声顿止，一只灰色的野猫从书架后窜了出来，打翻了桌上的墨水瓶。你松了一口气，拍了拍胸口。",
        translations: {
          "墨水": { pinyin: "mò shuǐ", meaning: "ink", level: "HSK 3" }
        },
        choices: [
          { text: "[ 返回故事列表 ]", nextNodeId: "end_back_to_list" }
        ]
      },
      inspect: {
        text: "你屏住呼吸，悄悄走到书架后。你探头一看，只见书架底部的暗格被打开了，里面空空如也。原来，已经有人先你一步拿走了里面的东西……",
        translations: {
          "暗格": { pinyin: "àn gé", meaning: "secret compartment", level: "HSK 5" }
        },
        choices: [
          { text: "[ 返回故事列表 ]", nextNodeId: "end_back_to_list" }
        ]
      }
    }
  }
};

export default function StoryReader({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params);
  const storyId = resolvedParams.id;
  const router = useRouter();

  const [currentNodeId, setCurrentNodeId] = useState("start");
  const [activeTooltip, setActiveTooltip] = useState<string | null>(null);
  const [isSubscribeOpen, setIsSubscribeOpen] = useState(false);
  const [savedWords, setSavedWords] = useState<string[]>([]);
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);

  // Get story data or fallback
  const story = STORY_REGISTRY[storyId] || STORY_REGISTRY["master-secret"];
  const node = story.nodes[currentNodeId] || story.nodes["start"];

  // Initialize Speech Voices (Client-only)
  useEffect(() => {
    if (typeof window !== "undefined" && window.speechSynthesis) {
      const loadVoices = () => {
        setVoices(window.speechSynthesis.getVoices());
      };
      loadVoices();
      window.speechSynthesis.onvoiceschanged = loadVoices;
    }

    // Read saved words from localStorage
    const saved = localStorage.getItem("cm_saved_words");
    if (saved) {
      setTimeout(() => {
        setSavedWords(JSON.parse(saved));
      }, 0);
    }
  }, [voices.length]);

  const handleChoiceClick = (choice: { text: string; nextNodeId: string; premium?: boolean }) => {
    if (choice.premium) {
      setIsSubscribeOpen(true);
      return;
    }

    if (choice.nextNodeId === "end_back_to_list") {
      router.push("/stories");
      return;
    }

    setCurrentNodeId(choice.nextNodeId);
    setActiveTooltip(null);
  };

  // TTS read aloud implementation
  const handlePlayAudio = () => {
    if (typeof window === "undefined" || !window.speechSynthesis) return;

    if (isPlayingAudio) {
      window.speechSynthesis.cancel();
      setIsPlayingAudio(false);
      return;
    }

    // Clean text by stripping custom markup e.g. [word]
    const cleanText = node.text.replace(/[\[\]]/g, "");
    const utterance = new SpeechSynthesisUtterance(cleanText);
    
    // Attempt to find a Chinese voice
    const chineseVoice = voices.find(
      (voice) => voice.lang.includes("zh-CN") || voice.lang.includes("zh-HK") || voice.lang.includes("zh-TW")
    );
    if (chineseVoice) {
      utterance.voice = chineseVoice;
    }
    
    utterance.rate = 0.85; // Slightly slower for language learners

    utterance.onend = () => {
      setIsPlayingAudio(false);
    };

    utterance.onerror = () => {
      setIsPlayingAudio(false);
    };

    setIsPlayingAudio(true);
    window.speechSynthesis.speak(utterance);
  };

  // Clean speech synthesis if component unmounts
  useEffect(() => {
    return () => {
      if (typeof window !== "undefined" && window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  const handleSaveWord = (word: string) => {
    let updatedWords = [...savedWords];
    if (savedWords.includes(word)) {
      // Remove word
      updatedWords = updatedWords.filter((w) => w !== word);
    } else {
      // Add word
      updatedWords.push(word);
      
      // Increment localStorage counter for Saved Words sidebar
      const currentCount = parseInt(localStorage.getItem("savedWordsCount") || "12");
      localStorage.setItem("savedWordsCount", (currentCount + 1).toString());
    }

    setSavedWords(updatedWords);
    localStorage.setItem("cm_saved_words", JSON.stringify(updatedWords));
  };

  // Helper function to split text and render highlighted words
  const renderTextWithHighlights = () => {
    const text = node.text;
    const translations = node.translations;
    
    // Sort keys by length descending to match larger words first
    const words = Object.keys(translations).sort((a, b) => b.length - a.length);
    if (words.length === 0) return text;

    // Build regex to match any of the words
    const escapedWords = words.map((w) => w.replace(/[-\/\\^$*+?.()|[\]{}]/g, "\\$&"));
    const regex = new RegExp(`(${escapedWords.join("|")})`, "g");
    const parts = text.split(regex);

    return parts.map((part, index) => {
      if (translations[part]) {
        const trans = translations[part];
        const isTooltipOpen = activeTooltip === part;
        const isSaved = savedWords.includes(part);

        return (
          <span 
            key={index} 
            className="relative inline-block"
            onMouseEnter={() => setActiveTooltip(part)}
            onMouseLeave={() => setActiveTooltip(null)}
          >
            {/* Highlighted word */}
            <span 
              onClick={() => setActiveTooltip(isTooltipOpen ? null : part)}
              className="word-highlight text-primary font-semibold select-none"
            >
              {part}
            </span>
            
            {/* Tooltip Content */}
            {isTooltipOpen && (
              <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-3 bg-surface/90 border border-surface-container-high/60 rounded-xl px-4 py-3 shadow-xl glass-panel text-center flex flex-col gap-1.5 z-30 min-w-[200px] animate-in fade-in slide-in-from-bottom-2 duration-200">
                <span className="font-ui-pinyin-sm text-sm text-secondary font-medium block">
                  {trans.pinyin}
                </span>
                <span className="font-ui-body text-sm text-on-surface-variant block whitespace-normal">
                  {trans.meaning}
                </span>
                {trans.level && (
                  <span className="text-[10px] uppercase tracking-wider text-primary bg-primary-container/10 px-2 py-0.5 rounded-full inline-block mx-auto">
                    {trans.level}
                  </span>
                )}
                
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleSaveWord(part);
                  }}
                  className={`mt-2 font-button-text text-[11px] uppercase tracking-wider py-1 px-3 rounded-full flex items-center justify-center gap-1.5 cursor-pointer border ${
                    isSaved
                      ? "bg-primary text-white border-primary"
                      : "bg-primary/5 text-primary border-primary/20 hover:bg-primary/10"
                  }`}
                >
                  {isSaved ? (
                    <BookmarkCheck className="h-3 w-3" />
                  ) : (
                    <Bookmark className="h-3 w-3" />
                  )}
                  {isSaved ? "Saved" : "Save"}
                </button>
              </span>
            )}
          </span>
        );
      }
      return part;
    });
  };

  return (
    <>
      <Navbar onSubscribeClick={() => setIsSubscribeOpen(true)} />

      {/* Reader Main Container */}
      <main className="flex-grow flex flex-col items-center justify-center pt-24 pb-section-gap px-reading-inset max-w-container-max mx-auto w-full relative z-10 min-h-[60vh]">
        
        {/* Story Paragraph Card */}
        <article className="w-full max-w-2xl relative mb-16 p-8 md:p-12 bg-[#F8F6F1] rounded-2xl border border-surface-container-high/20 shadow-sm">
          
          {/* Floating Audio Play Icon for Large Screens */}
          <button 
            onClick={handlePlayAudio}
            aria-label="Play audio narration" 
            className={`absolute -left-16 top-10 text-primary opacity-60 hover:opacity-100 transition-opacity p-3 rounded-full bg-surface-container/30 hover:bg-surface-container/70 hidden md:flex items-center justify-center ${
              isPlayingAudio ? "animate-pulse opacity-100 bg-primary/10" : ""
            }`}
          >
            {isPlayingAudio ? (
              <Square className="h-5 w-5 fill-primary" />
            ) : (
              <Volume2 className="h-5 w-5" />
            )}
          </button>

          {/* Chinese text block */}
          <p className="font-story-body-cn text-story-body-cn text-on-surface text-justify break-words tracking-wide leading-loose">
            {renderTextWithHighlights()}
          </p>

          {/* Inline Audio Icon for Mobile Screens */}
          <button 
            onClick={handlePlayAudio}
            aria-label="Play audio narration" 
            className={`mt-8 text-primary opacity-60 hover:opacity-100 transition-opacity p-2 border border-primary/20 rounded-full flex items-center gap-2 md:hidden ${
              isPlayingAudio ? "bg-primary/10 opacity-100" : "bg-primary/5"
            }`}
          >
            {isPlayingAudio ? (
              <Square className="h-4 w-4 fill-primary" />
            ) : (
              <Volume2 className="h-4 w-4" />
            )}
            <span className="font-ui-pinyin-sm text-xs uppercase tracking-wider">
              {isPlayingAudio ? "Stop Listening" : "Listen Narration"}
            </span>
          </button>
        </article>

        {/* CYOA Branching Options */}
        <section className="w-full max-w-md flex flex-col gap-4 mt-6">
          {node.choices.map((choice, i) => (
            <button
              key={i}
              onClick={() => handleChoiceClick(choice)}
              className="group w-full py-4 text-center relative overflow-hidden transition-all duration-300 rounded-lg cursor-pointer active:scale-98"
            >
              <span className={`font-button-text text-button-text uppercase tracking-widest relative z-10 transition-colors ${
                choice.premium ? "text-primary/70 group-hover:text-primary" : "text-secondary group-hover:text-primary"
              }`}>
                {choice.text}
              </span>
              {choice.premium && (
                <Lock className="h-3.5 w-3.5 text-primary ml-2 inline-block relative z-10" />
              )}
              {/* Bottom hairline */}
              <div className="absolute inset-x-0 bottom-0 h-[1px] bg-secondary-fixed/50 group-hover:bg-primary/30 transition-colors" />
              {/* Slide bg layer */}
              <div className="absolute inset-0 bg-primary/5 translate-y-full group-hover:translate-y-0 transition-transform duration-300 ease-out z-0" />
            </button>
          ))}
        </section>
      </main>

      <Footer />
      <SubscribeModal isOpen={isSubscribeOpen} onClose={() => setIsSubscribeOpen(false)} />
    </>
  );
}
