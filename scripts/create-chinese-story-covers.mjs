// Recreate this batch's local SVG assets; publication uses the existing asset upload flow.
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const root = fileURLToPath(new URL("../", import.meta.url));
const output = join(root, "public/covers");
mkdirSync(output, { recursive: true });

const covers = [
  {
    id: "the-borrowed-sect-1", title: "借来的山门 1", subtitle: "山下无水", en: "THE BORROWED SECT · PART ONE",
    label: "HSK 4 / XIANXIA", bg: "#173b3a", ink: "#f0e6c9", accent: "#d9ae65",
    description: "青山之间的山门，一条分开的水路和一把铜钥匙。",
    art: `<circle cx="902" cy="272" r="116" fill="#d9ae65" opacity=".8"/>
      <path d="M390 770 650 315 935 770Z" fill="#51736a"/><path d="M685 770 942 405 1200 770Z" fill="#345950"/>
      <path d="M700 900 812 699 774 644 821 591 823 530 844 573 811 640 858 691 805 900Z" fill="#b4d5c7"/>
      <path d="M833 687 1001 900H931L809 709Z" fill="#80b3a6"/>
      <path d="M510 602H971L903 556H578Z" fill="#142d2d" stroke="#d9ae65" stroke-width="5"/>
      <path d="M568 607V764M910 607V764" stroke="#e1c396" stroke-width="25"/>
      <path d="M576 657H904" stroke="#d9ae65" stroke-width="11"/>
      <g transform="translate(181 550) rotate(-23)"><circle r="49" fill="none" stroke="#d9ae65" stroke-width="20"/><path d="M0 49V186H36V155H0M0 119H30" fill="none" stroke="#d9ae65" stroke-width="19"/></g>`,
  },
  {
    id: "the-seven-oclock-lost-and-found", title: "七点前的失物", subtitle: "最后一班车，最后一条线索。", en: "LOST AND FOUND BEFORE SEVEN",
    label: "HSK 4 / MYSTERY", bg: "#203441", ink: "#f6e9cc", accent: "#e5ad69",
    description: "车站七点的时钟下，一个系着黄绳的蓝布包。",
    art: `<path d="M350 765H1130M350 813H1130" stroke="#486074" stroke-width="17"/>
      <path d="M402 715V858M1076 715V858" stroke="#486074" stroke-width="26"/>
      <circle cx="913" cy="351" r="143" fill="#efdfbe" stroke="#e5ad69" stroke-width="11"/>
      <g stroke="#203441" stroke-width="10"><path d="M913 224V247M913 455V478M786 351H809M1017 351H1040"/><path d="M913 351V263M913 351 872 424" stroke-linecap="round"/></g>
      <circle cx="913" cy="351" r="12" fill="#203441"/>
      <path d="M472 538Q469 501 514 500H773Q814 504 818 547L860 750H434Z" fill="#5e93b2" stroke="#a1c6d0" stroke-width="7"/>
      <path d="M563 502V463Q643 396 724 463V502" fill="none" stroke="#a1c6d0" stroke-width="18"/>
      <path d="M729 515 714 562 746 604M714 562 682 591" fill="none" stroke="#e5c572" stroke-width="11"/>
      <rect x="177" y="615" width="150" height="93" rx="4" fill="#efdfbe" transform="rotate(-9 177 615)"/>
      <path d="M199 641H286M197 664H266" stroke="#9a7958" stroke-width="7"/>`,
  },
  {
    id: "the-moon-greenhouse", title: "月面温室", subtitle: "漫长黑夜里，留住一片绿色。", en: "THE MOON GREENHOUSE",
    label: "HSK 4 / SCIENCE FICTION", bg: "#192846", ink: "#ecebcf", accent: "#a7d5bd",
    description: "月面灰色平原上的透明温室，里面亮着植物生长灯。",
    art: `<circle cx="994" cy="265" r="70" fill="#8dbec9"/><path d="M967 207Q1000 248 957 275L1020 316Q1077 255 1010 211Z" fill="#c7ddcb"/>
      <g fill="#d6e2df"><circle cx="683" cy="243" r="3"/><circle cx="855" cy="145" r="3"/><circle cx="1097" cy="390" r="4"/><circle cx="327" cy="432" r="3"/></g>
      <path d="M0 783Q334 703 574 790T1200 758V900H0Z" fill="#7d8796"/>
      <ellipse cx="757" cy="790" rx="346" ry="48" fill="#343e56"/>
      <path d="M434 753V660a310 310 0 0 1 620 0V753Z" fill="#456d72" stroke="#a7d5bd" stroke-width="9"/>
      <path d="M744 353V755M434 650H1054M474 508H1014M587 397Q529 603 590 755M901 397Q959 603 897 755" fill="none" stroke="#a7d5bd" stroke-width="6" opacity=".6"/>
      <g fill="#9dc574" stroke="#264849" stroke-width="7"><path d="M549 705V578M549 651Q481 650 508 601Q554 604 549 651M549 681Q619 672 598 626Q555 630 549 681"/>
      <path d="M687 712V610M687 672Q624 649 645 616Q683 623 687 672M687 690Q739 675 727 644Q687 646 687 690"/>
      <path d="M940 718V594M940 675Q1002 650 984 612Q943 620 940 675"/></g>
      <g fill="#e9c482"><circle cx="815" cy="630" r="19"/><circle cx="846" cy="638" r="17"/><circle cx="829" cy="655" r="18"/></g>
      <path d="M829 662V718" stroke="#9dc574" stroke-width="8"/>`,
  },
  {
    id: "before-the-rain-stops", title: "雨停之前", subtitle: "有些话，终于不用写在书里。", en: "BEFORE THE RAIN STOPS",
    label: "HSK 3 / ROMANCE", bg: "#663f49", ink: "#ffead9", accent: "#e6b192",
    description: "书店窗外下着雨，桌上是打开的书和两杯茶。",
    art: `<rect x="668" y="228" width="401" height="423" rx="125" fill="#b1c2c6" stroke="#e6b192" stroke-width="13"/>
      <path d="M868 230V653M667 468H1068" stroke="#663f49" stroke-width="12"/>
      <g stroke="#e4e1d9" stroke-width="5" opacity=".8"><path d="M741 302 715 361M812 260 777 338M1027 315 990 391M759 497 722 573M838 540 811 602M1002 516 967 595M962 253 927 328"/></g>
      <path d="M282 770H1140V900H282Z" fill="#a8736c"/>
      <path d="M393 658Q525 625 659 685Q761 627 909 656L928 802Q790 778 659 825Q526 778 389 801Z" fill="#f6ddbb" stroke="#663f49" stroke-width="9"/>
      <path d="M659 685V817M424 690Q519 669 610 704M424 722Q519 701 610 736M701 704Q790 667 873 690M701 736Q790 699 877 722" fill="none" stroke="#b68c79" stroke-width="6"/>
      <path d="M402 594H505V658Q453 694 402 658Z" fill="#e6b192"/>
      <path d="M505 605Q557 606 548 630Q539 649 505 640" fill="none" stroke="#e6b192" stroke-width="12"/>
      <path d="M954 656H1050V711Q1002 747 954 711Z" fill="#e6b192"/>
      <path d="M425 568Q409 548 431 526M987 628Q973 606 990 586" fill="none" stroke="#ffead9" stroke-width="5" opacity=".6"/>`,
  },
  {
    id: "manager-for-a-day", title: "今天谁当店长", subtitle: "十二份午饭，忙成二十四份。", en: "MANAGER FOR A DAY",
    label: "HSK 3 / COMEDY", bg: "#a6442e", ink: "#fff0cc", accent: "#f0c66c",
    description: "忙碌的小餐馆里，午餐盒旁堆着重复打印的小票。",
    art: `<path d="M379 388H1129V437H379Z" fill="#f0c66c"/>
      <path d="M427 442V729M1085 442V729" stroke="#743326" stroke-width="26"/>
      <path d="M252 744H1200V900H252Z" fill="#dc925b"/>
      <rect x="420" y="540" width="457" height="211" rx="34" fill="#efc887" stroke="#743326" stroke-width="10"/>
      <rect x="448" y="567" width="209" height="153" rx="21" fill="#fff0cc"/>
      <rect x="677" y="567" width="171" height="153" rx="21" fill="#805542"/>
      <g fill="#8a9c4d"><ellipse cx="713" cy="606" rx="25" ry="22"/><ellipse cx="779" cy="667" rx="27" ry="24"/><ellipse cx="820" cy="609" rx="22" ry="27"/></g>
      <g stroke="#d6ba8f" stroke-width="6"><path d="M486 596 504 600M555 589 573 593M597 635 615 639M479 679 497 683M557 678 575 682M525 628 543 632"/></g>
      <path d="M953 460H1114V804L1093 790 1073 804 1053 790 1033 804 1013 790 993 804 973 790 953 804Z" fill="#fff0cc" transform="rotate(9 1034 632)"/>
      <path d="M981 528H1085M981 565H1060M981 602H1085M981 687H1085M981 725H1060" stroke="#a6442e" stroke-width="7" transform="rotate(9 1034 632)"/>
      <path d="M443 498Q424 472 449 447M541 496Q562 467 542 446M735 497Q716 471 739 450" fill="none" stroke="#fff0cc" stroke-width="7" opacity=".7"/>`,
  },
];

for (const c of covers) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 900" role="img" aria-labelledby="title desc">
  <title id="title">${c.title}</title><desc id="desc">${c.description}</desc>
  <rect width="1200" height="900" fill="${c.bg}"/>
  <path d="M54 56H1146M54 56V844M54 844H1146M1146 56V844" fill="none" stroke="${c.ink}" stroke-width="2" opacity=".22"/>
  ${c.art}
  <g fill="${c.ink}" font-family="'Noto Serif CJK SC','Songti SC',serif">
    <text x="94" y="195" font-size="66" font-weight="700">${c.title}</text>
    <text x="97" y="248" font-size="29">${c.subtitle}</text>
  </g>
  <text x="98" y="309" fill="${c.accent}" font-family="Arial,sans-serif" font-size="20" letter-spacing="3">${c.en}</text>
  <text x="97" y="813" fill="${c.ink}" font-family="Arial,sans-serif" font-size="21" letter-spacing="2">${c.label}</text>
  </svg>\n`;
  writeFileSync(join(output, `${c.id}.svg`), svg);
  console.log(`Created ${c.id}.svg`);
}
