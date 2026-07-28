import { serveDir } from "jsr:@std/http/file-server";

let previousWord = ["しりとり"];
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

        const word = nextWord.trim();
        const lastWord = previousWord.at(-1);

        if (lastWord.slice(-1) !== word.slice(0, 1)) {
            score -= 10;
            return jsonResponse({ 
                errorMessage: "前の単語に続いていません", 
                errorCode: "10001" ,
                score,
            }, 400);
        }

        if (previousWord.includes(word)) {
            isGameOver = true;
            return jsonResponse({ errorMessage: "すでに使用された単語が入力されました。", errorCode: "10002" }, 401);
        }

        if (word.slice(-1) === "ん") {
            isGameOver = true;
            return jsonResponse({ errorMessage: "「ん」で終わる単語が入力されました。しりとりは終了です。", errorCode: "10000" }, 401);
        }

        previousWord.push(word);

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
        isGameOver = false;
        endScore = score;
        scoreBoard.push(endScore);
        if (request.method === "GET" && pathname === "/score-history") {
        return jsonResponse(scoreBoard);
        }
        score = 0;
        startedAt = Date.now();
        return jsonResponse({ word: previousWord.at(-1), score });
    }

    if (request.method === "GET" && pathname === "/recent-words") {
        return jsonResponse(previousWord.slice(1).slice(-5));
    }

    return serveDir(request, { fsRoot: "./public/", urlRoot: "", enableCors: true });
});
