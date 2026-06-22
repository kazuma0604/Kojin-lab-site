(function(){
'use strict';

// ===== constants =====
const MIN_DAYS = 1;            // 日数の下限（共有リンク改ざん対策のclampにも使用）
const MAX_DAYS = 7;            // 日数の上限
const DEFAULT_DAYS = 3;        // 初期日数
const DEFAULT_BUDGET = 'standard'; // 不正な予算値が来たときのフォールバック
const DOODLE_COUNT = 9;        // 浮遊ドゥードルの数
const LOAD_STEP_MS = 460;      // ローディングステップ更新間隔(ms)
const LOAD_DONE_MS = 560;      // ローディング完了→結果表示までの待ち(ms)
const MAP_DRAW_DELAY_MS = 60;  // 地図描画までの待ち(ms)
const MAP_INVALIDATE_MS = 120; // 地図サイズ再計算までの待ち(ms)
const DAY_REVEAL_BASE_MS = 120;// 1日目カード出現の基準待ち(ms)
const DAY_REVEAL_STEP_MS = 140;// 日ごとの出現ずらし(ms)
const TOAST_MS = 2300;         // トースト表示時間(ms)

const $ = s=>document.querySelector(s);
const SAVE_KEY='kl-travel-saved-v1';
const state={dest:'',days:DEFAULT_DAYS,budget:'saver',interests:[],plan:null};
let mapObj=null;

// ===== floating doodles =====
(function(){
  const emojis=['✈️','🧳','🗺️','📍','🌴','⛅','🎒','🏖️','🚗','🗼'];
  const box=$('#doodles');
  if(!box)return;
  for(let i=0;i<DOODLE_COUNT;i++){
    const d=document.createElement('div');d.className='doodle';
    d.textContent=emojis[i%emojis.length];
    d.style.top=(6+i*10)+'%';
    d.style.fontSize=(22+(i%3)*10)+'px';
    d.style.animationDuration=(26+i*4)+'s';
    d.style.animationDelay=(-i*5)+'s';
    box.appendChild(d);
  }
})();

// ===== inputs =====
const destInput=$('#dest');
$('#destChips').addEventListener('click',e=>{const c=e.target.closest('.chip');if(!c)return;destInput.value=c.dataset.d;document.querySelectorAll('#destChips .chip').forEach(x=>x.classList.toggle('on',x===c));});
destInput.addEventListener('input',()=>document.querySelectorAll('#destChips .chip').forEach(x=>x.classList.remove('on')));
$('#dayMinus').onclick=()=>{state.days=Math.max(MIN_DAYS,state.days-1);$('#dayVal').textContent=state.days;};
$('#dayPlus').onclick=()=>{state.days=Math.min(MAX_DAYS,state.days+1);$('#dayVal').textContent=state.days;};
$('#budgetSeg').addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;state.budget=b.dataset.b;document.querySelectorAll('#budgetSeg button').forEach(x=>x.classList.toggle('on',x===b));});
$('#interests').addEventListener('click',e=>{const it=e.target.closest('.int');if(!it)return;it.classList.toggle('on');state.interests=[...document.querySelectorAll('#interests .int.on')].map(x=>x.dataset.i);});

// ===== destination data =====
const DEST={
 '京都':{ll:[35.0116,135.7681],spots:[
   {n:'清水寺と二年坂さんぽ',e:'⛩',c:'culture',d:'朝の澄んだ空気で世界遺産を参拝。'},
   {n:'伏見稲荷大社 千本鳥居',e:'⛩',c:'view',d:'朱色の鳥居が続く絶景フォトスポット。'},
   {n:'錦市場で食べ歩き',e:'🍢',c:'gourmet',d:'「京の台所」で湯葉や生麩を。'},
   {n:'嵐山 竹林の小径',e:'🎋',c:'view',d:'見上げる竹林を散策。'},
   {n:'湯葉と京野菜の和ランチ',e:'🍱',c:'gourmet',d:'季節の京料理を上品に。'},
   {n:'金閣寺',e:'🏯',c:'culture',d:'水面に映る金色の楼閣。'},
   {n:'祇園の町家カフェ',e:'🍵',c:'relax',d:'抹茶スイーツでひと休み。'},
   {n:'先斗町で京の夜ごはん',e:'🏮',c:'gourmet',d:'鴨川沿いの路地で和の夜を。'},
   {n:'保津川下り',e:'🚣',c:'active',d:'渓谷を舟でめぐる。'},
   {n:'京都駅ビルでお土産探し',e:'🛍',c:'shopping',d:'和雑貨・八つ橋を。'},
   {n:'銀閣寺と哲学の道',e:'🍵',c:'culture',d:'侘び寂びの庭と桜並木の散歩道。'},
   {n:'三十三間堂',e:'🏯',c:'culture',d:'千体の千手観音像は圧巻。'},
   {n:'鴨川デルタでひと休み',e:'🦆',c:'relax',d:'川辺で京都の日常を感じる。'},
   {n:'北野天満宮',e:'⛩',c:'culture',d:'学問の神様と梅の名所。'},
   {n:'にしんそばの老舗',e:'🍜',c:'gourmet',d:'甘辛いにしんと香り高い出汁。'},
   {n:'町家でおばんざい',e:'🍶',c:'gourmet',d:'京の家庭料理を少しずつ。'},
   {n:'宇治抹茶の甘味処',e:'🍡',c:'gourmet',d:'抹茶パフェとわらび餅。'}]},
 '沖縄':{ll:[26.2124,127.6809],spots:[
   {n:'首里城公園',e:'🏯',c:'culture',d:'琉球王国の歴史にふれる。'},
   {n:'美ら海水族館',e:'🐠',c:'view',d:'ジンベエザメは圧巻。'},
   {n:'古宇利大橋ドライブ',e:'🚗',c:'view',d:'エメラルドの海を渡る橋。'},
   {n:'沖縄そばランチ',e:'🍜',c:'gourmet',d:'出汁の効いた郷土の味。'},
   {n:'青の洞窟シュノーケル',e:'🤿',c:'active',d:'透明な海で熱帯魚と。'},
   {n:'国際通りで食べ歩き',e:'🛍',c:'shopping',d:'紅いもタルト・島ぞうり。'},
   {n:'ビーチでサンセット',e:'🌅',c:'relax',d:'波音と夕陽を。'},
   {n:'やちむんの里めぐり',e:'🏺',c:'culture',d:'沖縄の器に出会う。'},
   {n:'アグー豚しゃぶの夕食',e:'🐖',c:'gourmet',d:'とろける島ブランド豚。'},
   {n:'ブルーシールアイスのカフェ',e:'🍦',c:'relax',d:'南国の甘いひととき。'},
   {n:'万座毛の絶景',e:'🌊',c:'view',d:'象の鼻の形をした断崖。'},
   {n:'斎場御嶽',e:'⛩',c:'culture',d:'琉球の聖地をめぐる。'},
   {n:'マングローブカヌー探検',e:'🛶',c:'active',d:'亜熱帯の森を水上から。'},
   {n:'瀬長島ウミカジテラス',e:'🏖',c:'relax',d:'海沿いの白い街でのんびり。'},
   {n:'ステーキハウスで島牛',e:'🥩',c:'gourmet',d:'締めにステーキが沖縄流。'},
   {n:'タコライス専門店',e:'🌮',c:'gourmet',d:'ご当地グルメの定番。'},
   {n:'海ぶどう丼ランチ',e:'🍚',c:'gourmet',d:'プチプチ食感の海の幸。'},
   {n:'揚げたてサーターアンダギー',e:'🍩',c:'gourmet',d:'素朴な沖縄ドーナツ。'}]},
 '札幌':{ll:[43.0618,141.3545],spots:[
   {n:'大通公園さんぽ',e:'🌳',c:'view',d:'季節の花とテレビ塔。'},
   {n:'味噌ラーメンの名店',e:'🍜',c:'gourmet',d:'濃厚スープで温まる。'},
   {n:'白い恋人パーク',e:'🍫',c:'culture',d:'お菓子作り体験。'},
   {n:'藻岩山の夜景',e:'🌃',c:'view',d:'日本新三大夜景。'},
   {n:'二条市場で海鮮丼',e:'🦀',c:'gourmet',d:'ウニ・イクラを贅沢に。'},
   {n:'モエレ沼公園',e:'🗻',c:'active',d:'アート公園をサイクリング。'},
   {n:'サッポロビール園',e:'🍺',c:'gourmet',d:'できたてビールと羊肉。'},
   {n:'狸小路でショッピング',e:'🛍',c:'shopping',d:'アーケードをぶらり。'},
   {n:'温泉でほっこり',e:'♨',c:'relax',d:'旅の疲れを癒やす。'},
   {n:'北海道神宮',e:'⛩',c:'culture',d:'静かな杜でお参り。'},
   {n:'時計台',e:'🕰',c:'culture',d:'札幌のシンボルを見学。'},
   {n:'円山動物園',e:'🐻',c:'active',d:'ホッキョクグマが人気。'},
   {n:'旧道庁赤れんが庁舎',e:'🏛',c:'culture',d:'歴史ある赤れんがの建物。'},
   {n:'定山渓温泉へ足をのばす',e:'♨',c:'relax',d:'渓谷の名湯で日帰り湯。'},
   {n:'スープカレーの名店',e:'🍛',c:'gourmet',d:'スパイス香る札幌名物。'},
   {n:'ジンギスカン食べ放題',e:'🐑',c:'gourmet',d:'煙もうもう、ラム肉を豪快に。'},
   {n:'シメパフェのカフェ',e:'🍨',c:'gourmet',d:'夜パフェは札幌の新定番。'}]},
 '東京':{ll:[35.6762,139.6503],spots:[
   {n:'浅草寺・仲見世通り',e:'⛩',c:'culture',d:'雷門から続く下町情緒。'},
   {n:'築地で海鮮の朝ごはん',e:'🍣',c:'gourmet',d:'活気ある場外で握りを。'},
   {n:'渋谷スカイで一望',e:'🏙',c:'view',d:'展望台から都市を。'},
   {n:'チームラボの没入アート',e:'🎨',c:'view',d:'光と映像に包まれる。'},
   {n:'原宿・表参道さんぽ',e:'🛍',c:'shopping',d:'最新トレンドを。'},
   {n:'上野の博物館めぐり',e:'🏛',c:'culture',d:'アートと自然を。'},
   {n:'東京湾クルーズ',e:'⛴',c:'active',d:'海から見る都市。'},
   {n:'銀座で和ディナー',e:'🍱',c:'gourmet',d:'特別な夜の一席。'},
   {n:'隠れ家カフェ',e:'☕',c:'relax',d:'路地裏でひと休み。'},
   {n:'お台場の夜景',e:'🌉',c:'view',d:'レインボーブリッジ。'},
   {n:'東京スカイツリー',e:'🗼',c:'view',d:'地上450mの展望回廊。'},
   {n:'明治神宮で森林浴',e:'🌳',c:'culture',d:'都心とは思えない静寂の杜。'},
   {n:'谷中銀座の下町さんぽ',e:'🐈',c:'relax',d:'猫と惣菜店の懐かしい商店街。'},
   {n:'国立科学博物館',e:'🦕',c:'culture',d:'恐竜化石と日本の自然史。'},
   {n:'月島でもんじゃ焼き',e:'🍳',c:'gourmet',d:'自分で焼く下町グルメ。'},
   {n:'行列のラーメン店',e:'🍜',c:'gourmet',d:'人気の一杯を求めて。'},
   {n:'江戸前天ぷらランチ',e:'🍤',c:'gourmet',d:'揚げたてサクサクを。'},
   {n:'浅草の老舗甘味',e:'🍡',c:'gourmet',d:'あんみつとほうじ茶で一服。'}]},
 'パリ':{ll:[48.8566,2.3522],spots:[
   {n:'エッフェル塔',e:'🗼',c:'view',d:'パリの象徴を間近で。'},
   {n:'ルーブル美術館',e:'🖼',c:'culture',d:'名画の宝庫。'},
   {n:'モンマルトルの丘',e:'⛪',c:'view',d:'芸術家の街を一望。'},
   {n:'本場のクロワッサン',e:'🥐',c:'gourmet',d:'テラスで優雅な朝を。'},
   {n:'セーヌ川クルーズ',e:'⛴',c:'active',d:'川から名所をめぐる。'},
   {n:'シャンゼリゼでショッピング',e:'🛍',c:'shopping',d:'凱旋門まで散策。'},
   {n:'ビストロでコース',e:'🍷',c:'gourmet',d:'ワインと本場の味。'},
   {n:'オルセー美術館',e:'🎨',c:'culture',d:'印象派の名作。'},
   {n:'公園でピクニック',e:'🧺',c:'relax',d:'チーズとパンで。'},
   {n:'夜のイルミ散歩',e:'✨',c:'view',d:'光の都の夜。'},
   {n:'ノートルダム大聖堂',e:'⛪',c:'culture',d:'ゴシック建築の傑作を。'},
   {n:'凱旋門の屋上テラス',e:'🏛',c:'view',d:'放射状の大通りを一望。'},
   {n:'マレ地区の街歩き',e:'🏘',c:'relax',d:'おしゃれな路地とブティック。'},
   {n:'ヴェルサイユ宮殿',e:'👑',c:'culture',d:'豪華絢爛な宮殿と庭園。'},
   {n:'マカロンの名店',e:'🍬',c:'gourmet',d:'宝石のようなお菓子。'},
   {n:'チーズとワインのバー',e:'🧀',c:'gourmet',d:'種類豊富なフロマージュを。'},
   {n:'そば粉のガレット',e:'🥞',c:'gourmet',d:'クレープリーで軽食を。'},
   {n:'エスカルゴのビストロ',e:'🐌',c:'gourmet',d:'フランスの定番をぜひ。'}]},
 'バンコク':{ll:[13.7563,100.5018],spots:[
   {n:'ワット・ポー（涅槃仏）',e:'🛕',c:'culture',d:'黄金の巨大仏。'},
   {n:'チャオプラヤー川のボート',e:'⛴',c:'active',d:'水の都を船で。'},
   {n:'屋台でパッタイ',e:'🍜',c:'gourmet',d:'本場のスパイシー。'},
   {n:'ワット・アルン',e:'🛕',c:'view',d:'夕暮れに映える仏塔。'},
   {n:'チャトゥチャック市場',e:'🛍',c:'shopping',d:'巨大マーケットで宝探し。'},
   {n:'タイ古式マッサージ',e:'💆',c:'relax',d:'疲れをほぐす。'},
   {n:'ルーフトップバー',e:'🍸',c:'view',d:'高層から夜景を。'},
   {n:'王宮とエメラルド寺院',e:'👑',c:'culture',d:'荘厳な建築。'},
   {n:'マンゴースイーツ',e:'🥭',c:'relax',d:'南国フルーツで涼を。'},
   {n:'川沿いシーフード',e:'🦐',c:'gourmet',d:'海の幸を豪快に。'},
   {n:'カオサン通り散策',e:'🎒',c:'relax',d:'バックパッカー街の喧騒を。'},
   {n:'ジム・トンプソンの家',e:'🏠',c:'culture',d:'タイシルク王の邸宅美術館。'},
   {n:'水上マーケット',e:'🛶',c:'active',d:'運河に浮かぶ屋台で買い物。'},
   {n:'アユタヤ遺跡へ足をのばす',e:'🛕',c:'culture',d:'世界遺産の古都めぐり。'},
   {n:'トムヤムクン専門店',e:'🍲',c:'gourmet',d:'世界三大スープを本場で。'},
   {n:'カオマンガイの食堂',e:'🍗',c:'gourmet',d:'やわらか蒸し鶏ごはん。'},
   {n:'グリーンカレーの名店',e:'🍛',c:'gourmet',d:'ココナッツ香る本格カレー。'},
   {n:'ロティとタイティー',e:'🫓',c:'gourmet',d:'屋台スイーツで甘いひと息。'}]}
};
function genericSpots(dest){return[
  {n:dest+'の中心街さんぽ',e:'🚶',c:'view',d:'まずは街の雰囲気を。'},
  {n:'人気のローカルランチ',e:'🍽',c:'gourmet',d:'その土地ならではの一皿。'},
  {n:dest+'のランドマーク',e:'📷',c:'view',d:'定番の絶景スポットへ。'},
  {n:'歴史を感じる街並み',e:'🏛',c:'culture',d:'古い建物や寺社を。'},
  {n:'カフェでひと休み',e:'☕',c:'relax',d:'地元のカフェでまったり。'},
  {n:'人気のディナー',e:'🍷',c:'gourmet',d:'夜は名物料理に舌鼓。'},
  {n:'アクティビティ体験',e:'🚴',c:'active',d:'街をアクティブに。'},
  {n:'市場でお買い物',e:'🛍',c:'shopping',d:'お土産探し。'},
  {n:'展望スポット',e:'🌆',c:'view',d:'高台から街を。'},
  {n:'スパでリフレッシュ',e:'♨',c:'relax',d:'体をいたわる。'},
  {n:'地元の人気グルメ店',e:'🍴',c:'gourmet',d:'ガイド掲載の名店へ。'},
  {n:'名物スイーツのカフェ',e:'🍰',c:'gourmet',d:'ご当地スイーツでひと息。'},
  {n:'川沿い・海沿いの散歩道',e:'🌊',c:'view',d:'水辺の景色を楽しむ。'},
  {n:'美術館・博物館めぐり',e:'🖼',c:'culture',d:'その土地の文化にふれる。'},
  {n:'自然公園でリフレッシュ',e:'🌲',c:'relax',d:'緑の中をのんびり。'},
  {n:'人気の体験アクティビティ',e:'🎟',c:'active',d:'予約して特別な体験を。'}];}

const CAT_TAG={gourmet:{t:'グルメ',c:'#f59e0b'},view:{t:'絶景',c:'#0ea5e9'},culture:{t:'文化',c:'#8b5cf6'},active:{t:'体験',c:'#10b981'},relax:{t:'のんびり',c:'#ec4899'},shopping:{t:'買い物',c:'#ef4444'}};
const MOVES=['徒歩約8分','徒歩約12分','電車で約15分','バスで約20分','タクシーで約10分'];
const DAY_THEMES=['定番をおさえる王道コース','地元の魅力を深掘りする日','少し足をのばす冒険デー','のんびり満喫する日','街歩きと食を楽しむ日','絶景とアクティブの欲ばり日','最終日は名残を惜しんで'];
const SLOTS=[{t:'09:00'},{t:'11:00'},{t:'12:30',g:1},{t:'14:30'},{t:'16:30'},{t:'18:30',g:1}];
const BUDGET={saver:{label:'節約',per:8000,hotel:'ゲストハウス・ビジネスホテル',memo:'コスパ重視で無料スポットや食べ歩きを多めに。'},standard:{label:'標準',per:16000,hotel:'シティホテル・人気の宿',memo:'観光と食事をバランスよく楽しむ王道プラン。'},luxury:{label:'贅沢',per:35000,hotel:'高級ホテル・温泉旅館',memo:'特別な体験と上質な食事で記念の旅に。'}};

// 共有リンク等の外部入力に備え、不正な予算値はフォールバックに寄せる。
function budgetOf(key){return BUDGET[key]||BUDGET[DEFAULT_BUDGET];}
// 共有リンク等の外部入力に備え、日数を MIN_DAYS〜MAX_DAYS にclampする（NaNは下限）。
function clampDays(n){const v=Math.floor(Number(n));if(!Number.isFinite(v))return MIN_DAYS;return Math.min(MAX_DAYS,Math.max(MIN_DAYS,v));}

function shuffle(a){for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;}
// 使った場所を記録し、プールに未使用が残る限り同じ場所は選ばない。同じ日には重複させない。
function makePicker(poolArr,used){
  const pool=poolArr.length?poolArr:[{n:'自由散策',e:'🚶',c:'relax',d:'気になる場所を自由に歩く。'}];
  let idx=0;
  return dayUsed=>{
    let pick=null;
    // pass0=全体で未使用を優先 / pass1=今日まだ使っていない場所 / それも無ければ巡回
    for(let pass=0;pass<2&&!pick;pass++){
      for(let k=0;k<pool.length;k++){
        const c=pool[(idx+k)%pool.length];
        if(dayUsed.has(c.n))continue;
        if(pass===0&&used.has(c.n))continue;
        pick=c;idx=(idx+k+1)%pool.length;break;
      }
    }
    if(!pick){pick=pool[idx%pool.length];idx++;}
    used.add(pick.n);dayUsed.add(pick.n);
    return pick;
  };
}
function buildPlan(){
  const dest=state.dest||'この街';
  const all=DEST[dest]?DEST[dest].spots.slice():genericSpots(dest);
  const gourmet=shuffle(all.filter(s=>s.c==='gourmet'));      // 昼夜のグルメ枠専用
  let regular=shuffle(all.filter(s=>s.c!=='gourmet'));          // それ以外（グルメと重複させない）
  // 好みが指定されたら、該当スポットを前方に寄せて優先的に使う（足りなければ他も使う＝重複は増やさない）
  if(state.interests.length){const want=new Set(state.interests);regular.sort((a,b)=>(want.has(b.c)?1:0)-(want.has(a.c)?1:0));}
  const ll=DEST[dest]?DEST[dest].ll:null;
  const used=new Set();
  const nextG=makePicker(gourmet,used);
  const nextS=makePicker(regular,used);
  const days=[];let pin=0;
  for(let d=0;d<state.days;d++){
    const items=[];const dayUsed=new Set();
    SLOTS.forEach((slot,idx)=>{
      const spot=slot.g?nextG(dayUsed):nextS(dayUsed);
      const coord= ll? [ll[0]+Math.sin(pin*1.7)*0.02, ll[1]+Math.cos(pin*1.3)*0.025] : null;
      pin++;
      items.push({time:slot.t,n:spot.n,e:spot.e,c:spot.c,d:spot.d,coord,move:idx<SLOTS.length-1?MOVES[Math.floor(Math.random()*MOVES.length)]:null});
    });
    days.push({theme:DAY_THEMES[d%DAY_THEMES.length],items});
  }
  return {dest,days,hasMap:!!ll,center:ll,budget:state.budget,interests:state.interests.slice(),daysCount:state.days};
}
function memoFor(day,i,dest){
  const tips=[`${dest}は朝が空いていて狙い目。早めの行動でゆったり楽しめます。`,`移動の合間に地元カフェへ。SNS映えする一枚も。`,`歩く距離が長めの日。歩きやすい靴と水分補給を。`,`この日は無理せずのんびり。気に入った場所で長居も。`,`夕方は光がきれいな時間帯。カメラの準備を。`,`ランチは混みやすいので11:30頃の入店がスムーズ。`];
  return tips[i%tips.length];
}
function esc(s){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}

// ===== views =====
function show(view){document.querySelectorAll('.view').forEach(v=>v.classList.remove('active'));$('#'+view).classList.add('active');window.scrollTo({top:0,behavior:'smooth'});}

// ===== render result =====
function render(plan){
  state.plan=plan;
  const b=budgetOf(plan.budget);
  const daysCount=clampDays(plan.daysCount);
  const styleLabels=(plan.interests||[]).map(i=>CAT_TAG[i]?CAT_TAG[i].t:i).join('・')||'おまかせ';
  let html=`
   <div class="res-head">
     <div class="label">Your AI Itinerary</div>
     <h2>${esc(plan.dest)}・${daysCount}日間の旅</h2>
     <div class="res-meta"><span>🗓 ${daysCount}日間</span><span>💴 ${b.label}プラン</span><span>🎯 ${esc(styleLabels)}</span></div>
   </div>
   <div class="toolbar">
     <button class="tool" id="toggleMap">🗺 地図で見る</button>
     <button class="tool" id="saveBtn">🔖 保存</button>
     <button class="tool" id="shareBtn">🔗 共有リンク</button>
     <button class="tool" id="copyText">📋 テキストでコピー</button>
     <button class="tool" id="printBtn">🖨 印刷・PDF</button>
   </div>
   <div id="map"></div><div class="map-note" id="mapNote">※ スポットの位置はデモ用のおおよその表示です。</div>
   <div class="ai-intro"><span class="av">🤖</span><div>${esc(plan.dest)}の${daysCount}日間プランができました！${b.memo}各スポットは「${esc(styleLabels)}」のお好みに合わせています。地図表示・並べ替え・保存・共有もできます。</div></div>
   <div id="days"></div>
   <div class="budget"><div><div class="lbl">${b.label}プランの費用目安（1人・宿泊/交通別）</div><div class="big">約 ¥${(b.per*daysCount).toLocaleString()}〜</div></div><div class="lbl" style="flex:1;min-width:200px">食事・観光・体験の合計目安です。おすすめの宿：<b>${b.hotel}</b></div></div>
   <div class="bottom-actions"><button class="btn primary" id="again">🔄 別のプランを作る</button><button class="btn" id="reset">最初からやり直す</button></div>`;
  $('#resultView').innerHTML=html;
  renderDays();
  show('resultView');
  $('#toggleMap').onclick=toggleMap;
  $('#saveBtn').onclick=savePlan;
  $('#shareBtn').onclick=sharePlan;
  $('#copyText').onclick=copyText;
  $('#printBtn').onclick=()=>window.print();
  $('#again').onclick=()=>generate();
  $('#reset').onclick=()=>{location.hash='';show('formView');};
  requestAnimationFrame(()=>{[...document.querySelectorAll('#days .day')].forEach((d,i)=>setTimeout(()=>d.classList.add('in'),DAY_REVEAL_BASE_MS+i*DAY_REVEAL_STEP_MS));});
}
function renderDays(){
  const plan=state.plan;let html='';
  plan.days.forEach((day,di)=>{
    html+=`<div class="day" data-di="${di}"><div class="day-head"><div class="day-num"><span class="d">${di+1}</span><span class="l">DAY</span></div><div><h3>${di+1}日目</h3><div class="theme">${esc(day.theme)}</div></div></div><div class="timeline">`;
    day.items.forEach((it,ii)=>{
      const tag=CAT_TAG[it.c]||{t:'観光',c:'#64748b'};
      html+=`<div class="tl" draggable="true" data-di="${di}" data-ii="${ii}">
        <div class="tl-time">${it.time}</div>
        <div class="tl-ic">${it.e||'📍'}</div>
        <div class="tl-body"><h4>${esc(it.n)}<span class="tl-tag" style="background:${tag.c}">${tag.t}</span></h4><p>${esc(it.d)}</p>${it.move?`<span class="tl-move">🚶 ${it.move}</span>`:''}</div>
        <div class="tl-ctrl"><button class="up" title="上へ" aria-label="このスポットを上へ移動">▲</button><button class="down" title="下へ" aria-label="このスポットを下へ移動">▼</button><button class="del" title="削除" aria-label="このスポットを削除">✕</button></div>
      </div>`;
    });
    html+=`</div><button class="add-spot" data-di="${di}">＋ スポットを追加</button><div class="day-memo"><span class="em">💡</span><div>${esc(memoFor(day,di,plan.dest))}</div></div></div>`;
  });
  $('#days').innerHTML=html;
  bindEdit();
  if($('#map').classList.contains('show')) drawMap();
}
// ===== edit / reorder =====
function bindEdit(){
  $('#days').querySelectorAll('.tl-ctrl .up').forEach(btn=>btn.onclick=e=>{const tl=e.target.closest('.tl');move(+tl.dataset.di,+tl.dataset.ii,-1);});
  $('#days').querySelectorAll('.tl-ctrl .down').forEach(btn=>btn.onclick=e=>{const tl=e.target.closest('.tl');move(+tl.dataset.di,+tl.dataset.ii,1);});
  $('#days').querySelectorAll('.tl-ctrl .del').forEach(btn=>btn.onclick=e=>{const tl=e.target.closest('.tl');del(+tl.dataset.di,+tl.dataset.ii);});
  $('#days').querySelectorAll('.add-spot').forEach(btn=>btn.onclick=e=>addSpot(+e.target.dataset.di));
  let dragEl=null;
  $('#days').querySelectorAll('.tl').forEach(el=>{
    el.addEventListener('dragstart',()=>{dragEl=el;el.classList.add('dragging');});
    el.addEventListener('dragend',()=>{el.classList.remove('dragging');$('#days').querySelectorAll('.tl').forEach(x=>x.classList.remove('dragover'));});
    el.addEventListener('dragover',ev=>{ev.preventDefault();if(el!==dragEl&&dragEl&&el.dataset.di===dragEl.dataset.di)el.classList.add('dragover');});
    el.addEventListener('dragleave',()=>el.classList.remove('dragover'));
    el.addEventListener('drop',ev=>{ev.preventDefault();if(!dragEl||el===dragEl)return;if(el.dataset.di!==dragEl.dataset.di)return;reorder(+dragEl.dataset.di,+dragEl.dataset.ii,+el.dataset.ii);});
  });
}
function retime(items){items.forEach((it,i)=>{it.time=SLOTS[i]?SLOTS[i].t:('20:'+(i*10).toString().padStart(2,'0'));it.move=i<items.length-1?(it.move||MOVES[i%MOVES.length]):null;});}
function move(di,ii,dir){const arr=state.plan.days[di].items;const j=ii+dir;if(j<0||j>=arr.length)return;[arr[ii],arr[j]]=[arr[j],arr[ii]];retime(arr);renderDays();reveal();}
function reorder(di,from,to){const arr=state.plan.days[di].items;const [x]=arr.splice(from,1);arr.splice(to,0,x);retime(arr);renderDays();reveal();}
function del(di,ii){const arr=state.plan.days[di].items;if(arr.length<=1){toast('1日に最低1つは残してください');return;}arr.splice(ii,1);retime(arr);renderDays();reveal();toast('スポットを削除しました');}
function addSpot(di){const dest=state.plan.dest;const pool=DEST[dest]?DEST[dest].spots:genericSpots(dest);const cur=new Set(state.plan.days[di].items.map(x=>x.n));const cand=pool.filter(s=>!cur.has(s.n));const s=(cand.length?cand:pool)[Math.floor(Math.random()*(cand.length?cand.length:pool.length))];const arr=state.plan.days[di].items;arr.push({time:'20:00',n:s.n,e:s.e,c:s.c,d:s.d,coord:state.plan.center?[state.plan.center[0]+Math.sin(arr.length*1.7)*0.02,state.plan.center[1]+Math.cos(arr.length)*0.025]:null,move:null});retime(arr);renderDays();reveal();toast('スポットを追加しました ✨');}
function reveal(){[...document.querySelectorAll('#days .day')].forEach(d=>d.classList.add('in'));}

// ===== map =====
function toggleMap(){
  const m=$('#map'),note=$('#mapNote'),btn=$('#toggleMap');
  if(m.classList.contains('show')){m.classList.remove('show');note.classList.remove('show');btn.classList.remove('on');btn.textContent='🗺 地図で見る';return;}
  if(!state.plan.hasMap){toast('この行き先は地図デモ未対応です（京都/沖縄/札幌/東京/パリ/バンコク対応）');return;}
  if(typeof L==='undefined'){toast('地図の読み込みに失敗しました');return;}
  m.classList.add('show');note.classList.add('show');btn.classList.add('on');btn.textContent='🗺 地図を閉じる';
  setTimeout(drawMap,MAP_DRAW_DELAY_MS);
}
const DAYCOLORS=['#2563eb','#ec4899','#10b981','#f59e0b','#8b5cf6','#06b6d4','#ef4444'];
function drawMap(){
  const el=$('#map');if(!state.plan.center||typeof L==='undefined')return;
  if(mapObj){mapObj.remove();mapObj=null;}
  mapObj=L.map(el,{scrollWheelZoom:false}).setView(state.plan.center,13);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{attribution:'© OpenStreetMap',maxZoom:18}).addTo(mapObj);
  const all=[];
  state.plan.days.forEach((day,di)=>{
    const col=DAYCOLORS[di%DAYCOLORS.length];const pts=[];
    day.items.forEach((it,ii)=>{if(!it.coord)return;pts.push(it.coord);all.push(it.coord);
      const ic=L.divIcon({className:'',html:`<div style="background:${col};color:#fff;width:26px;height:26px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:12px;box-shadow:0 2px 6px rgba(0,0,0,.3);border:2px solid #fff">${ii+1}</div>`,iconSize:[26,26],iconAnchor:[13,13]});
      L.marker(it.coord,{icon:ic}).addTo(mapObj).bindPopup(`<b>Day${di+1} ${it.time}</b><br>${esc(it.n)}`);});
    if(pts.length>1){L.polyline(pts,{color:col,weight:3,opacity:.7,dashArray:'7 8'}).addTo(mapObj);}
  });
  if(all.length)mapObj.fitBounds(L.latLngBounds(all).pad(0.25));
  setTimeout(()=>{if(mapObj)mapObj.invalidateSize();},MAP_INVALIDATE_MS);
}

// ===== save / history =====
function getSaved(){try{return JSON.parse(localStorage.getItem(SAVE_KEY))||[];}catch(e){return[];}}
function setSaved(a){localStorage.setItem(SAVE_KEY,JSON.stringify(a));updateCount();}
function updateCount(){const n=getSaved().length;const b=$('#savedCount');if(!b)return;b.textContent=n;b.style.display=n?'inline-block':'none';}
function savePlan(){const a=getSaved();a.unshift({id:'p'+Date.now(),plan:state.plan,savedAt:nowStr(),fav:false});setSaved(a);toast('プランを保存しました 🔖');}
function nowStr(){const d=new Date();return `${d.getFullYear()}/${(d.getMonth()+1)}/${d.getDate()}`;}
function openDrawer(){renderSaved();$('#overlay').classList.add('show');$('#drawer').classList.add('show');drawerOpen=true;lastFocused=document.activeElement;const close=$('#closeSaved');if(close)close.focus();}
function closeDrawer(){$('#overlay').classList.remove('show');$('#drawer').classList.remove('show');drawerOpen=false;if(lastFocused&&typeof lastFocused.focus==='function')lastFocused.focus();}
function renderSaved(){
  const a=getSaved();const list=$('#savedList');
  if(!a.length){list.innerHTML='<div class="saved-empty">まだ保存したプランはありません。<br>プランを作って「🔖 保存」してみましょう。</div>';return;}
  a.sort((x,y)=>(y.fav-x.fav));
  list.innerHTML=a.map(it=>{const p=it.plan;const b=budgetOf(p.budget);const dc=clampDays(p.daysCount);return `<div class="saved-item" data-id="${it.id}"><h4>${it.fav?'⭐ ':''}${esc(p.dest)}・${dc}日間</h4><div class="meta">${b.label}プラン ／ 保存日 ${it.savedAt}</div><div class="row2"><span class="meta">タップで開く</span><div class="acts"><button class="fav ${it.fav?'on':''}" data-id="${it.id}" title="お気に入り" aria-label="お気に入りに切り替え">★</button><button class="del" data-id="${it.id}" title="削除" aria-label="このプランを削除">🗑</button></div></div></div>`;}).join('');
  list.querySelectorAll('.saved-item').forEach(el=>el.addEventListener('click',e=>{if(e.target.closest('.acts'))return;loadSaved(el.dataset.id);}));
  list.querySelectorAll('.acts .fav').forEach(btn=>btn.addEventListener('click',e=>{e.stopPropagation();toggleFav(btn.dataset.id);}));
  list.querySelectorAll('.acts .del').forEach(btn=>btn.addEventListener('click',e=>{e.stopPropagation();delSaved(btn.dataset.id);}));
}
function loadSaved(id){const it=getSaved().find(x=>x.id===id);if(!it)return;closeDrawer();render(it.plan);}
function toggleFav(id){const a=getSaved();const it=a.find(x=>x.id===id);if(it)it.fav=!it.fav;setSaved(a);renderSaved();}
function delSaved(id){setSaved(getSaved().filter(x=>x.id!==id));renderSaved();toast('削除しました');}
$('#openSaved').onclick=openDrawer;$('#closeSaved').onclick=closeDrawer;$('#overlay').onclick=closeDrawer;

// ===== drawer accessibility: Esc to close + focus trap =====
let drawerOpen=false;
let lastFocused=null;
document.addEventListener('keydown',e=>{
  if(!drawerOpen)return;
  if(e.key==='Escape'){closeDrawer();return;}
  if(e.key==='Tab'){
    const drawer=$('#drawer');
    const focusables=drawer.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
    if(!focusables.length)return;
    const first=focusables[0],last=focusables[focusables.length-1];
    if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}
    else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}
  }
});

// ===== share / export =====
function sharePlan(){
  try{
    const enc=btoa(encodeURIComponent(JSON.stringify(state.plan)));
    const url=location.origin+location.pathname+'#p='+enc;
    if(navigator.clipboard&&navigator.clipboard.writeText){navigator.clipboard.writeText(url).then(()=>toast('共有リンクをコピーしました 🔗'),()=>fallbackCopy(url));}
    else fallbackCopy(url);
    history.replaceState(null,'','#p='+enc);
  }catch(e){toast('共有リンクの生成に失敗しました');}
}
function fallbackCopy(t){const ta=document.createElement('textarea');ta.value=t;document.body.appendChild(ta);ta.select();try{document.execCommand('copy');toast('共有リンクをコピーしました 🔗');}catch(e){toast('コピーできませんでした');}ta.remove();}
function copyText(){
  const p=state.plan;let t=`【${p.dest}・${clampDays(p.daysCount)}日間の旅】たびAIで作成\n`;
  p.days.forEach((day,di)=>{t+=`\n■ ${di+1}日目（${day.theme}）\n`;day.items.forEach(it=>{t+=`${it.time} ${it.n}\n`;});});
  if(navigator.clipboard&&navigator.clipboard.writeText){navigator.clipboard.writeText(t).then(()=>toast('テキストをコピーしました 📋'),()=>fallbackCopy(t));}
  else fallbackCopy(t);
}
function loadFromHash(){
  if(location.hash.startsWith('#p=')){
    try{
      const p=JSON.parse(decodeURIComponent(atob(location.hash.slice(3))));
      // 共有リンク改ざん対策: 必須構造を検証し、不正値は安全側へ正規化してから描画する。
      if(p&&Array.isArray(p.days)&&p.days.length){
        p.daysCount=clampDays(p.daysCount!=null?p.daysCount:p.days.length);
        if(!BUDGET[p.budget])p.budget=DEFAULT_BUDGET;
        if(!Array.isArray(p.interests))p.interests=[];
        render(p);
        return true;
      }
    }catch(e){}
  }
  return false;
}

// ===== loading + generate =====
const loadSteps=['行き先の情報を集めています','おすすめスポットを選んでいます','移動ルートを最適化しています','1日ごとの時間割を組み立てています','最後の仕上げ中…'];
function generate(){
  show('loadingView');
  $('#loadTitle').textContent=`AIが${state.dest||'あなた'}の旅程を考えています…`;
  let i=0;$('#loadBar').style.width='0';
  const tick=()=>{$('#loadStep').textContent=loadSteps[i];$('#loadBar').style.width=((i+1)/loadSteps.length*100)+'%';i++;
    if(i<loadSteps.length)setTimeout(tick,LOAD_STEP_MS);
    else setTimeout(()=>{history.replaceState(null,'','#');render(buildPlan());},LOAD_DONE_MS);};
  tick();
}
$('#go').onclick=()=>{state.dest=destInput.value.trim();if(!state.dest){toast('行き先を入力してください ✈');destInput.focus();return;}generate();};
$('#home').onclick=()=>{location.hash='';show('formView');};

function toast(msg){const t=$('#toast');t.textContent=msg;t.classList.add('show');clearTimeout(t._t);t._t=setTimeout(()=>t.classList.remove('show'),TOAST_MS);}

// init
updateCount();
if(!loadFromHash()) show('formView');
window.addEventListener('hashchange',()=>{if(location.hash.startsWith('#p='))loadFromHash();});
})();
