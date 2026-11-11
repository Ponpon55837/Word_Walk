// Original Word Walk material. Each set supplies the four options for a cloze;
// keep the other three words grammatically plausible but wrong in context.
const sets = [
  [
    ['receipt', '收據', 'The cashier printed a ____ showing exactly what I paid.'],
    ['umbrella', '雨傘', 'I opened my ____ above my head to keep the rain off.'],
    ['wallet', '皮夾', 'I keep my bank cards and folded bills in a leather ____.'],
    ['mirror', '鏡子', 'I looked in the ____ to check whether my face was clean.'],
  ],
  [
    ['kettle', '水壺', 'I filled the ____ with water and set it on the stove to boil.'],
    ['fork', '叉子', 'I used the four pointed teeth of my ____ to lift a potato.'],
    ['strainer', '濾網', 'I poured the pasta into a ____ so the water could drain away.'],
    ['tray', '托盤', 'The server carried six glasses on a flat ____.'],
  ],
  [
    ['platform', '月台', 'Passengers waited on the ____ beside the tracks for their train.'],
    ['runway', '跑道', 'The plane touched down on the long airport ____.'],
    ['tunnel', '隧道', 'The road goes through a dark ____ beneath the mountain.'],
    ['crosswalk', '行人穿越道', 'We crossed the street on foot inside the painted ____.'],
  ],
  [
    ['borrow', '借入', 'May I ____ your bicycle for an hour? I will bring it back.'],
    ['repair', '修理', 'The chain is broken. Can you ____ it so the bicycle works again?'],
    ['weigh', '秤重', 'Please ____ the apples on the scale to find their price.'],
    ['fold', '摺疊', 'Please ____ the map in half along the dotted line.'],
  ],
  [
    ['shallow', '淺的', 'The pool is so ____ that the water barely covers my ankles.'],
    ['narrow', '狹窄的', 'The doorway is too ____ for this wide desk to fit through.'],
    ['fragile', '易碎的', 'This glass ornament is very ____ and could break if dropped.'],
    ['steep', '陡峭的', 'The hill is so ____ that cyclists walk their bikes up it.'],
  ],
  [
    ['drawer', '抽屜', 'I pulled the ____ out of my desk to reach the pencils inside.'],
    ['ceiling', '天花板', 'Lying on her back indoors, she saw a lamp fixed to the ____.'],
    ['hinge', '鉸鏈', 'The metal ____ lets the cabinet door swing open and shut.'],
    ['curtain', '窗簾', 'I drew the cloth ____ across the window to block the sun.'],
  ],
  [
    ['whisper', '低聲說話', 'Please ____ so the sleeping baby cannot hear our conversation.'],
    ['measure', '測量', 'Use a ruler to ____ the length of this strip of paper.'],
    ['peel', '削去外皮', 'Use your fingers to ____ the orange before eating it.'],
    ['stir', '攪拌', 'Use a spoon to ____ the soup in slow circles.'],
  ],
  [
    ['pharmacy', '藥局', 'I took the prescription to the ____ to get my medicine.'],
    ['bakery', '麵包店', 'The ____ on our street sells loaves still warm from its oven.'],
    ['museum', '博物館', 'The ____ displays ancient pottery with labels explaining its history.'],
    ['cinema', '電影院', 'We bought two tickets at the ____ to watch a film on the big screen.'],
  ],
  [
    ['thirsty', '口渴的', 'After the long run I felt ____ and wanted a large glass of water.'],
    ['crowded', '擁擠的', 'The bus was so ____ that there was no room for another passenger.'],
    ['slippery', '滑溜的', 'Fresh ice made the path ____ under our boots.'],
    ['ripe', '成熟可食的', 'The green bananas turned yellow and were finally ____ enough to eat.'],
  ],
  [
    ['envelope', '信封', 'I slipped the letter into an ____ and sealed it before mailing it.'],
    ['calendar', '月曆', 'The wall ____ has a box for each day of the month.'],
    ['eraser', '橡皮擦', 'I rubbed the pencil mark with an ____ until it disappeared.'],
    ['ruler', '尺', 'I lined up the centimeter marks on my ____ with the edge of the page.'],
  ],
  [
    ['harbor', '港灣', 'Fishing boats sheltered in the ____ while the sea outside was rough.'],
    ['orchard', '果園', 'We picked apples from rows of trees in the ____.'],
    ['desert', '沙漠', 'Rain is rare in this sandy ____, so travelers carry extra water.'],
    ['waterfall', '瀑布', 'The river drops over a cliff in a roaring ____.'],
  ],
  [
    ['unplug', '拔掉插頭', 'Before cleaning the toaster, ____ it from the wall socket.'],
    ['kneel', '跪下', 'To reach the low shelf, ____ on the mat beside it.'],
    ['underline', '畫底線', 'Use a pen to ____ the title with one straight line beneath it.'],
    ['rinse', '沖洗', 'After using soap on the cup, ____ it under clean running water.'],
  ],
]

export const englishWords = sets.flatMap((group) =>
  group.map(([word, meaning, sentence]) => ({
    word,
    meaning,
    sentence,
    alternatives: group.filter(([other]) => other !== word).map(([other]) => other),
  })),
)
