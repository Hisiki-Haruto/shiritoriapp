import { serveDir } from "jsr:@std/http/file-server";

let previousWord = ["しりとり"];
let previousReading = ["しりとり"];
let isGameOver = false;
let startedAt = Date.now();
let score = 0;
let endScore = 0;
let scoreBoard = [];

const jsonResponse = (body, status = 200) => new Response(
    JSON.stringify(body),
    {
        status,
        headers: { "Content-Type": "application/json; charset=utf-8" },
    },
);

function normalizeKana(text) {
    if (!text) return "";

    return text
        .replace(/[ァ-ヶ]/g, (s) =>
            String.fromCharCode(s.charCodeAt(0) - 0x60)
        )
        .replace(/ぁ/g, "あ")
        .replace(/ぃ/g, "い")
        .replace(/ぅ/g, "う")
        .replace(/ぇ/g, "え")
        .replace(/ぉ/g, "お")
        .replace(/ゃ/g, "や")
        .replace(/ゅ/g, "ゆ")
        .replace(/ょ/g, "よ")
        .replace(/っ/g, "つ")
        .replace(/ゔ/g, "う");
}

function normalizeVoiced(kana) {
    return kana
        .replace(/[がぎぐげご]/g, c => "かきくけこ"["がぎぐげご".indexOf(c)])
        .replace(/[ざじずぜぞ]/g, c => "さしすせそ"["ざじずぜぞ".indexOf(c)])
        .replace(/[だぢづでど]/g, c => "たちつてと"["だぢづでど".indexOf(c)])
        .replace(/[ばびぶべぼ]/g, c => "はひふへほ"["ばびぶべぼ".indexOf(c)])
        .replace(/[ぱぴぷぺぽ]/g, c => "はひふへほ"["ぱぴぷぺぽ".indexOf(c)]);
}

function getFirstKana(reading) {
    return normalizeKana(reading).charAt(0);
}

function getLastKana(reading) {
    const r = removeLongSound(normalizeKana(reading));
    return r.charAt(r.length - 1);

}

function removeLongSound(reading) {
    const chars = [...reading];

    while (chars.length > 1 && chars.at(-1) === "ー") {
        chars.pop();
    }

    return chars.join("");
}

const dictionary = new Map();        // 単語 → 読み
const readingDictionary = new Map(); // 読み → 単語

const data = await Deno.readFile("./SKK-JISYO.L.unannotated");
const decoder = new TextDecoder("utf-8");
const text = decoder.decode(data);
/* ===== 辞書内容確認用 =====
let count = 0;



for (const line of text.split(/\r?\n/)) {
    if (!line.startsWith(";") && line.trim()) {
        console.log(JSON.stringify(line));
        count++;
    }

    if (count >= 3) break;
}*/

for (const line of text.split(/\r?\n/)) {

    if (line.startsWith(";")) continue;
    if (!line.trim()) continue;

    const index = line.search(/\s/);
    if (index === -1) continue;

    const reading = line.substring(0, index);
    const words = line.substring(index).trim();

    if (!reading || !words) continue;

    const normalizedReading = normalizeKana(reading);
    const list = words.split("/").filter(Boolean);

    // まず元の読みを登録
    dictionary.set(normalizedReading, normalizedReading);

    for (const word of list) {

        // 元の候補
        dictionary.set(word, normalizedReading);

        if (/^[ァ-ヶー]+$/.test(word)) {
            // カタカナならひらがなを読みとして使う
            const hira = normalizeKana(word);

            dictionary.set(word, hira);
            dictionary.set(hira, hira);

            if (!readingDictionary.has(hira)) {
                readingDictionary.set(hira, word);
            }
        } else {
            // 漢字などはSKKの読みを使う
            if (!readingDictionary.has(normalizedReading)) {
                readingDictionary.set(normalizedReading, word);
            }
        }
    }

    // 漢字しか無かった場合
    if (!readingDictionary.has(normalizedReading)) {
        readingDictionary.set(normalizedReading, list[0]);
    }
}

/* ===== デバッグ用（必要なときだけ有効化） =====
    console.log("辞書数:", dictionary.size);
    console.log("読み辞書数:", readingDictionary.size);
    console.log("dictionary ゴリラ =", dictionary.get("ゴリラ"));
    console.log("reading ごりら =", readingDictionary.get("ごりら"));
    console.log("dictionary 林檎 =", dictionary.get("林檎"));
    console.log("reading りんご =", readingDictionary.get("りんご"));
*/

Deno.serve(async (request) => {
    const pathname = new URL(request.url).pathname;

    if (request.method === "GET" && pathname === "/shiritori") {
        return jsonResponse({ word: previousWord.at(-1), score });
    }

    if (request.method === "POST" && pathname === "/shiritori") {
        const { nextWord } = await request.json();

        if (isGameOver) {
            return jsonResponse({ errorMessage: "ゲームは終了しています。リセットしてください。", errorCode: "10003" }, 409);
        }

        if (typeof nextWord !== "string" || nextWord.trim() === "") {
            score -= 10;
            return jsonResponse({ 
                errorMessage: "単語を入力してください。", 
                errorCode: "10004" ,
                score,
            }, 400);
        }

        const input = nextWord.trim();
        const word = input.replace(/[ァ-ヶ]/g, (s) =>
            String.fromCharCode(s.charCodeAt(0) - 0x60)
        );
        let dictionaryReading = dictionary.get(word);

        // 表記検索で見つからなかった場合
        // ひらがな読みとして存在するか確認
        if (!dictionaryReading) {
            const normalizedInput = normalizeKana(word);

            if (readingDictionary.has(normalizedInput)) {
                dictionaryReading = normalizedInput;
            }
        }

        if (!dictionaryReading) {
            score -= 10;

            return jsonResponse({
                errorMessage: "辞書に存在しない単語です。",
                errorCode: "10005",
                score,
            }, 400);
        }

        const reading = normalizeKana(dictionaryReading);
        const lastReading = previousReading.at(-1);

        if (normalizeVoiced(getLastKana(lastReading)) !== normalizeVoiced(getFirstKana(reading))) {
            score -= 10;
            return jsonResponse({ 
                errorMessage: "前の単語に続いていません", 
                errorCode: "10001" ,
                score,
            }, 400);
        }

        if(previousReading.includes(reading)){
            isGameOver = true;
            return jsonResponse({
                errorMessage:"既に使用された単語です。",
                errorCode:"10002"
            },401);
        }

        if (getLastKana(reading) === "ん") {
            isGameOver = true;
            return jsonResponse({ errorMessage: "「ん」で終わる単語が入力されました。しりとりは終了です。", errorCode: "10000" }, 401);
        }

        previousWord.push(word);
        previousReading.push(reading);

        const elapsed = Date.now() - startedAt;
        if (elapsed < 20_000) {
            score += 50;
        } else if (elapsed < 40_000) {
            score += 40;
        } else if (elapsed < 60_000) {
            score += 30;
        } else if (elapsed < 80_000) {
            score += 20;
        } else if (elapsed < 100_000) {
            score += 10;
        } else {
            score += 1;
        }
        startedAt = Date.now();

        return jsonResponse({ word, score });
    }

    if (request.method === "POST" && pathname === "/reset") {
        previousWord = ["しりとり"];
        previousReading = ["しりとり"];
        isGameOver = false;
        endScore = score;
        if (endScore > 0) {
            scoreBoard.push(endScore);
        }
        score = 0;
        startedAt = Date.now();
        return jsonResponse({ word: previousWord.at(-1), score });
    }

    if (request.method === "GET" && pathname === "/score-history") {
        return jsonResponse(scoreBoard);
    }

    if (request.method === "GET" && pathname === "/recent-words") {
        return jsonResponse(previousWord.slice(1).slice(-5));
    }

    return serveDir(request, { fsRoot: "./public/", urlRoot: "", enableCors: true });
});
