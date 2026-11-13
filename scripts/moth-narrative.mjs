// Authored story dialogue in Traditional Chinese with the game's English localization.
const scenes = {
  LEVEL1_OFFICE_VICTORY_DIALOGUE: [
    ['GANGAN', '不錯，能通過第一個考驗，看來你不是純靠外表的花瓶。', "Not bad. You passed the first test. I guess you're more than a pretty face.", { portraitFrame: 5 }],
    ['Bobby', '如果換張臉不就是在蓋章而已嗎？美麗本人不是白叫的好嗎？！', "With any other face, it'd just be stamping papers. They don't call me Dr. Beauty for nothing!", { portraitFrame: 3 }],
    ['Bobby', '你看看我的臉，毛細孔比畫素還要小。', 'Look at my face. My pores are smaller than pixels.', { portraitFrame: 2 }],
    ['GANGAN', '你還是謙虛點吧，能撐過第二關再說！', 'Stay humble. Talk to me when you make it through level two!', { portraitFrame: 4 }]
  ],
  LEVEL_2_PREFIGHT_DIALOGUE: [
    ['GANGAN', '要想做一個成熟的藝人，你必須得承受的住網路上的各種酸言酸語。', 'If you want to make it as an artist, you have to learn to take all the nasty comments people throw at you online.'],
    ['GANGAN', '清潔廁所就是一個很好的開始，因為這是酸味的來源，交給你了。', "Cleaning the toilet is a good place to start. That's where the stink comes from. It's all yours."],
    ['Bobby', '好臭！', 'It reeks!'],
    ['酸民', '又禿又油又肥～', 'Bald, greasy, and fat!'],
    ['Bobby', '呃，你好像是想說些什麼。可是，我沒有要聽。', "Uh, it sounds like you've got something to say. I don't feel like listening."],
    ['酸民', '又禿又油有又肥～', 'Bald, greasy, and and fat!'],
    ['Bobby', '閉嘴！你的嘴非常的臭，而且你多打了一個”有”字！', 'Shut up! Your breath stinks, and you typed “and” twice!'],
    ['酸民', '又禿又油又肥～', 'Bald, greasy, and fat!'],
    ['Bobby', '講不聽喔，那我只好拍死你叻～', "Still won't listen? Guess I'll have to swat you."]
  ],
  LEVEL_2_POST_BOSS_DIALOGUE: [
    ['BOBBY', '噢，好噁喔！', 'Ugh, gross!'],
    ['BOBBY', '時間不早了！快點搞一搞回家吧，不然又要被祖賢唸了。', "It's getting late! I'd better wrap this up and get home before Zuxian gets on my case again."],
    ['BOBBY', '我怎麼沒穿衣服？!', "Wait, why am I naked?!"]
  ],
  LEVEL_3_PREFIGHT_DIALOGUE: [
    ['祖賢', '死鬼，又去哪裡鬼混了！是不是忘記你還有夜班沒上？', "Where have you been fooling around this time, you jerk? Forget you had a night shift?", { zuxianFace: 'angry' }],
    ['Bobby', '不是，乾乾現在要我當饒舌歌手了，在忙著寫歌！', "No, Gan Gan wants me to be a rapper now. I've been busy writing songs!", { bobbyFrame: 2 }],
    ['祖賢', '哪來那麼多藉口，快點過來開工！', 'Enough excuses. Get over here and get to work!', { zuxianFace: 'annoyed' }]
  ],
  LEVEL_3_POST_BOSS_DIALOGUE: [
    ['Bobby', '老婆大人，請問今天還算來勁嗎？', 'My darling wife, did that do it for you tonight?', { bobbyFrame: 1 }],
    ['祖賢', '算你沒退步…帶勁帶勁....', "You haven't lost your touch… Yeah, that hit the spot.", { zuxianFace: 'content' }],
    ['Bobby', '進廣告！', 'And now, a word from our sponsor!', { bobbyFrame: 3 }],
    ['祖賢', 'Master Of The House 第一季款式已經全面上線，各大通路都買不到，只有在M.O.T.H自己的官方網站可以買得到！', 'The full Master of the House Season 1 collection is live, exclusively on the official M.O.T.H website!', { zuxianFace: 'talking' }],
    ['Bobby', '明天還要帶小孩去上學，這樣我早上還起得來嗎？', 'I still have to take the kids to school tomorrow. Am I even going to wake up in time?', { bobbyFrame: 1 }]
  ],
  LEVEL_4_PREFIGHT_DIALOGUE: [
    ['Bobby', '喔！你在偷偷打電動齁！', 'Aha! Sneaking in some video games, are you?', { bobbyFrame: 3 }],
    ['Bonita', '因為我一直在等你回家阿。', "I've been waiting for you to come home."],
    ['Bobby', '…', '…', { bobbyFrame: 1 }],
    ['Bobby', '好啦，你在玩什麼，我陪你。', 'All right. What are you playing? I’ll play with you.', { bobbyFrame: 1 }]
  ],
  LEVEL_4_POST_BOSS_DIALOGUE: [
    ['Bonita', '哇！把拔你也太強了吧！', 'Wow! Daddy, you’re so good!'],
    ['Bobby', '嘿嘿，把拔以前可是在慈濟國中打贏上人的電動冠軍，他們那時候都叫把拔本人上人～', 'Heh. Back at Tzu Chi Junior High, Daddy was the video game champ. I even beat the Master, so they called me Master Beauty.', { bobbyFrame: 3 }],
    ['Bonita', '什麼是人上人？', 'What’s a Master Beauty?'],
    ['Bobby', '長大再告訴你。不過現在，該睡搞搞囉。', 'I’ll tell you when you’re older. Right now, it’s sleepy time.', { bobbyFrame: 1 }]
  ],
  LEVEL_4_EXIT_MONOLOGUE: [
    ['Bobby', '再等等，BONITA。', 'Just a little longer, Bonita.', { bobbyFrame: 1 }],
    ['Bobby', '等GTA 6出了把拔就可以放假陪你了。', 'When GTA 6 comes out, Daddy can take some time off and spend it with you.', { bobbyFrame: 1 }],
    ['Bobby', '我老闆答應過我了！', 'My boss promised!', { bobbyFrame: 3 }]
  ],
  LEVEL5_STUDIO_PRE_DIALOGUE: [
    ['GANGAN', '作為一名專業的饒舌歌手，除了要有迷之自信以外，還要有狠勁！', 'A pro rapper needs an absurd amount of confidence and a mean streak!'],
    ['BOBBY', '耍狠！？萬一有人diss我怎麼辦？', 'A mean streak?! What if someone disses me?'],
    ['GANGAN', '那我們今天就錄一首Diss歌。送他們一首Gang Shyt！', 'Then let’s record a diss track today. Give them some Gang Shyt!']
  ],
  LEVEL5_STUDIO_POST_DIALOGUE: [
    ['GANGAN', '我的老天！這種Diss我從來沒聽過，這就是化干歌為玉帛的聲音!', 'My God! I’ve never heard a diss like that. That’s what burying the hatchet sounds like!'],
    ['BOBBY', '…', '…'],
    ['BOBBY', '真的嗎？', 'Really?'],
    ['BOBBY', '…老闆是不是癡呆了...還裝模作樣....', '…Is the boss losing it? He’s still acting like he knows what he’s doing…']
  ],
  LEVEL_5_GANGAN_DIALOGUE: [
    ['Bobby', '老謝啊...', 'Old Hsieh…'],
    ['Gan Gan', '老你個頭，叫我老闆！', 'Who are you calling old? Call me Boss!'],
    ['Bobby', '老闆阿，這張專輯我們已經做了六年啦。', 'Boss, we’ve been working on this album for six years.'],
    ['Bobby', '到了這個年紀，我也不禁開始思考。我們做的音樂到底是唱給誰聽？', 'At my age, I can’t help wondering who we’re really making music for.'],
    ['Bobby', '現在做音樂究竟是因為自己還有熱忱，還是因為現在回頭已經太晚了？', 'Am I still making music because I love it, or because it’s too late to turn back?'],
    ['Bobby', '甚至現在半夜頻尿的次數越來越多...', 'I’m even getting up to pee more and more at night…'],
    ['Bobby', '會不會專輯還沒寫完，你就癡呆到不認得我了？', 'What if you forget who I am before we even finish the album?'],
    ['Gan Gan', '你是誰？', 'Who are you?'],
    ['Gan Gan', '來，你尿一個我看。我讓你聽一下新做好的歌。', 'Come on, show me how far you can pee. I’ll play you the song I just finished.']
  ],
  LEVEL_5_POST_DIALOGUE: [
    ['Gan Gan', '你看。你還能尿這麼遠。', 'See? You can still pee that far.'],
    ['Gan Gan', '證明了你還未觸及到你的天花板。', 'That proves you haven’t hit your ceiling yet.'],
    ['Bobby', '真的嗎老闆？你真的是這麼想的嗎？', 'Really, Boss? You really think so?'],
    ['Gan Gan', '當然啦！所以你不需要多想。先回家好好睡個覺，明天又是新的一天。', 'Of course! Don’t overthink it. Go home and get some sleep. Tomorrow’s a new day.'],
    ['Gan Gan', '你在我心裡一直都是最棒的！', 'You’ve always been the best in my book!'],
    ['Bobby', '嗚嗚嗚...老闆...你尿得太近了....', 'Sob… Boss… you’re peeing too close to me…']
  ],
  LEVEL_6_DREAM_VO: [
    ['VO', '美麗本人那天晚上做了一個夢。', 'That night, Dr. Beauty had a dream.'],
    ['VO', '在夢裡，美麗本人與謝乾乾終於走上了屬於他們的大舞台。', 'In his dream, Dr. Beauty and Gan Gan finally stepped onto a big stage of their own.'],
    ['VO', '沒有人知道這個舞台具體在何方，但是我們大家都願意相信這個夢。', 'Nobody knows exactly where that stage is, but we’re all willing to believe in the dream.']
  ],
  LEVEL_6_WAKE_DIALOGUE: [
    ['Bobby', '…', '…'],
    ['Bobby', '這個景象我會記住的！', 'I’ll remember what I saw!']
  ]
};

export function patchNarrative(once, edit) {
  for (const [name, lines] of Object.entries(scenes)) {
    const dialogue = lines.map(([speaker, text, en, portrait]) => ({ speaker, text, en, ...portrait }));
    edit('const ' + name + ' = [\n', '\n];\n', () =>
      'const ' + name + ' = ' + JSON.stringify(dialogue, null, 2) + ';\n');
  }
  once('streakBreak: [{ en: "Shake it off. They\'ll come back.", zh: "甩掉它，他們會回來的。" }]',
    'streakBreak: [{ en: "Shake off that miss. You’ll get your rhythm back.", zh: "忘記剛剛的失誤，手感會回來的" }]');
  once('    const normal = this.getHomeStageDefs().filter((stage) => STAGE_SELECT_STAGE_IDS.includes(stage.id));',
    `    const normal = this.getHomeStageDefs()
      .filter(stage => STAGE_SELECT_STAGE_IDS.includes(stage.id))
      .map(stage => stage.id === "finale-stage1" ? { ...stage, title: this.tr("Ending credits", "片尾字幕") } : stage);`);
  once('levelName: "Finale Ending",\n        levelLabel: "FINALE",',
    'levelName: "Finale Ending",\n        levelLabel: "BONUS",');
}
