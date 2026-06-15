/**
 * 路径图节点的短标题（用于 StoryMap 上每个节点的文字）。
 * 与故事正文分离：正文在 src/data/<id>.json，这里只放地图展示用的精简 label。
 * 新增故事时在此登记一份 { nodeId: 短标题 }；缺省时 StoryMap 回退用 nodeId。
 */
export const STORY_MAP_LABELS: Record<string, Record<string, string>> = {
  "last-train": {
    start: "上车",
    observe: "观察乘客",
    see_faces: "无脸乘客",
    explore_car: "穿过车厢",
    talk_old: "角落老人",
    ask_meaning: "循环真相",
    ask_escape: "逃离之法",
    pull_brake: "拉下制动闸",
    driver_door: "驾驶室",
    platform: "站台",
    wait_dawn: "守到黎明",
    confront_driver: "质问司机",
    take_controls: "抢夺操纵杆",
    read_ticket: "回到人间",
    ending_loop: "陷入循环",
    ending_conductor: "成为引路人",
    ending_void: "坠入虚无",
  },
  "master-secret": {
    start: "推开房门",
    sneak: "潜入丹房",
    wait: "丹房外等待",
    leave: "离开此地",
    read_notes: "师尊手札",
    hide: "躲藏窥视",
    bow: "躬身行礼",
    explain: "回头认错",
  },
  "haunted-house": {
    start: "Enter the mansion",
    hallway: "Dark hallway",
    white_woman: "The white lady",
    diary: "Cursed diary",
    staircase: "Old staircase",
    mirror_trap: "Mirror trap",
    basement: "The basement",
    wait_dawn: "Wait for dawn",
  },
  "signal-from-the-deep": {
    start: "The night shift",
    trace: "Trace the signal",
    wake: "Wake the captain",
    wait: "Record and wait",
    dive: "Dive to the deep",
    reply: "Reply to it",
    evacuate: "Evacuate",
    ending_silence: "Cut the power",
  },
};
