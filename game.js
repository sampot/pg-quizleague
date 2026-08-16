export const QUESTIONS=[["臺灣最高峰？", ["玉山", "雪山", "合歡山", "阿里山"], 0], ["臺灣最長河川？", ["淡水河", "濁水溪", "高屏溪", "曾文溪"], 1], ["珍珠奶茶發源於？", ["臺灣", "泰國", "日本", "韓國"], 0], ["臺灣國際電話碼？", ["+886", "+81", "+852", "+65"], 0], ["日月潭位於？", ["南投", "花蓮", "嘉義", "宜蘭"], 0], ["平溪知名活動？", ["放天燈", "搶孤", "蜂炮", "龍舟"], 0], ["端午節常吃？", ["粽子", "月餅", "湯圓", "年糕"], 0], ["臺北101地上樓層？", ["101", "88", "99", "108"], 0], ["太陽系最大行星？", ["火星", "木星", "土星", "地球"], 1], ["水的化學式？", ["CO2", "H2O", "O2", "NaCl"], 1], ["一年通常幾天？", ["360", "365", "366", "364"], 1], ["世界最大洋？", ["印度洋", "太平洋", "大西洋", "北冰洋"], 1], ["三角形內角和？", ["90", "180", "270", "360"], 1], ["聲音不能在哪傳播？", ["空氣", "水", "真空", "鋼"], 2], ["植物光合作用吸收？", ["氧氣", "氮氣", "二氧化碳", "氫"], 2], ["人體最大器官？", ["心臟", "皮膚", "肺", "肝"], 1], ["紅血球主要運送？", ["氧氣", "糖", "神經", "骨質"], 0], ["閏年二月幾天？", ["28", "29", "30", "31"], 1], ["地球天然衛星？", ["月球", "太陽", "火星", "金星"], 0], ["水的冰點？", ["0°C", "10°C", "32°C", "100°C"], 0], ["1公里幾公尺？", ["100", "500", "1000", "10000"], 2], ["唯一偶質數？", ["1", "2", "4", "6"], 1], ["蒙娜麗莎作者？", ["梵谷", "達文西", "莫內", "畢卡索"], 1], ["奧運五環幾環？", ["4", "5", "6", "7"], 1], ["鋼琴標準琴鍵？", ["66", "72", "88", "100"], 2], ["英文字母數？", ["24", "25", "26", "27"], 2], ["日本首都？", ["大阪", "京都", "東京", "札幌"], 2], ["澳洲首都？", ["雪梨", "墨爾本", "坎培拉", "伯斯"], 2], ["世界最高峰？", ["玉山", "聖母峰", "富士山", "白朗峰"], 1], ["章魚幾顆心臟？", ["1", "2", "3", "4"], 2], ["蜜蜂製造？", ["蜂蜜", "牛奶", "絲", "墨汁"], 0], ["鯨魚屬於？", ["魚類", "哺乳類", "兩棲類", "爬蟲類"], 1], ["彩虹通常幾色？", ["5", "6", "7", "8"], 2], ["CPU中文？", ["中央處理器", "記憶體", "硬碟", "顯示器"], 0], ["HTML描述？", ["網頁結構", "資料庫", "音訊", "系統"], 0], ["二進位使用？", ["0與1", "1與2", "A與B", "正與負"], 0], ["Elo用於？", ["競技排名", "溫度", "音量", "壓縮"], 0], ["臺灣東側海洋？", ["太平洋", "印度洋", "大西洋", "北冰洋"], 0], ["臺灣貨幣？", ["新臺幣", "日圓", "美元", "歐元"], 0], ["故宮位於臺北哪區？", ["士林", "信義", "萬華", "北投"], 0], ["鹽水蜂炮在？", ["臺南", "基隆", "臺東", "新竹"], 0], ["阿里山著名交通？", ["森林鐵路", "纜車", "捷運", "單軌"], 0], ["貓空以何聞名？", ["茶園", "鹽田", "稻田", "漁港"], 0], ["野柳著名岩石？", ["女王頭", "豆腐岩", "燭台石", "以上皆是"], 3], ["臺灣本島最南端？", ["鵝鑾鼻", "富貴角", "三貂角", "蘇澳"], 0]].map(([text,choices,answer])=>({text,choices,answer}));

export function elo(rating,opponent,win,k=32){
  return Math.round(rating+k*((win?1:0)-1/(1+10**((opponent-rating)/400))));
}

function matchQuestions(match){
  return Array.from({length:10},(_,index)=>QUESTIONS[((match-1)*7+index)%QUESTIONS.length]);
}

export function createGame(){
  return{rating:1200,match:1,index:0,score:0,aiScore:0,seasonWins:0,questions:matchQuestions(1),betweenMatches:false,meter:0,outcome:"playing",msg:"賽季開幕！每場十題。"};
}

export function getLegalActions(state){
  if(state.outcome!=="playing")return[];
  return state.betweenMatches?["nextMatch"]:["answer1","answer2","answer3","answer4"];
}

export function applyAction(state,action){
  const next=structuredClone(state);
  if(action==="nextMatch"&&next.betweenMatches){
    next.match++;
    next.index=0;
    next.score=0;
    next.aiScore=0;
    next.questions=matchQuestions(next.match);
    next.betweenMatches=false;
    next.msg=`第 ${next.match} 場開始，對手 Elo ${1180+next.match*12}。`;
    return next;
  }
  if(next.betweenMatches||!action.startsWith("answer"))return next;
  const question=next.questions[next.index];
  const choice=Number(action.at(-1))-1;
  const correct=choice===question.answer;
  next.score+=correct?10:0;
  const aiCorrect=((next.match*13+next.index*7)%10)<Math.min(8,4+Math.floor(next.match/2));
  next.aiScore+=aiCorrect?10:0;
  next.msg=correct?"答對！":`答錯，答案：${question.choices[question.answer]}`;
  next.index++;
  next.meter=((next.match-1)*10+next.index);
  if(next.index===10){
    const won=next.score>=next.aiScore;
    next.seasonWins+=won?1:0;
    next.rating=elo(next.rating,1180+next.match*12,won);
    if(next.match===10){
      next.outcome=next.seasonWins>=6?"won":"lost";
      next.msg=`賽季結束：${next.seasonWins} 勝 · Elo ${next.rating}`;
      next.meter=100;
    }else{
      next.betweenMatches=true;
      next.msg=`第 ${next.match} 場${won?"勝利":"落敗"} · Elo ${next.rating}`;
    }
  }
  return next;
}

export function summarize(state){
  const question=state.questions[Math.min(state.index,9)];
  return{match:`${state.match}/10`,rating:state.rating,record:`${state.seasonWins} 勝`,question:`${state.index}/10`,meter:state.meter,score:state.score,msg:state.betweenMatches||state.outcome!=="playing"?state.msg:`${question.text} · ${question.choices.map((choice,index)=>`${index+1}.${choice}`).join(" / ")}`,outcome:state.outcome};
}
export function getOutcome(s){return s.outcome}
