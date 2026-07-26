// server.js
import { serveDir } from "jsr:@std/http/file-server";

// 直前の単語を保持しておく
let previousWord = ["しりとり"];
let isGameOver = false;
// localhostにDenoのHTTPサーバーを展開
Deno.serve(async (_req) => {
    // パス名を取得する
    // http://localhost:8000/hoge に接続した場合"/hoge"が取得できる
    const pathname = new URL(_req.url).pathname;
    console.log(`pathname: ${pathname}`);

    // GET /shiritori: 直前の単語を返す
    if (_req.method === "GET" && pathname === "/shiritori") {
        return new Response(previousWord.at(-1));
    }

    // POST /shiritori: 次の単語を受け取って保存する
    if (_req.method === "POST" && pathname === "/shiritori") {
        // リクエストのペイロードを取得
        const requestJson = await _req.json();
        // JSONの中からnextWordを取得
        const nextWord = requestJson["nextWord"];
        const lastWord = previousWord.at(-1);

        if (isGameOver) {
            return new Response(
                JSON.stringify({
                    "errorMessage": "ゲームは終了しています。リセットしてください。",
                    "errorCode": "10003",
                }),
                {
                    status: 409,
                    headers: {
                        "Content-Type": "application/json; charset=utf-8",
                    },
                },
            );
        }

        // 前の単語に続いていない場合、エラーを返す
        if (lastWord.slice(-1) !== nextWord.slice(0, 1)) {
            return new Response(
                JSON.stringify({
                    "errorMessage": "前の単語に続いていません",
                    "errorCode": "10001",
                }),
                {
                    status: 400,
                    headers: {
                        "Content-Type": "application/json; charset=utf-8",
                    },
                },
            );
        }

        // すでに入力された単語の場合、エラーを返す
        if (previousWord.includes(nextWord)) {
            isGameOver = true;
            return new Response(
                JSON.stringify({
                    "errorMessage": "すでに使用された単語が入力されました。",
                    "errorCode": "10002",
                }),
                {
                    status: 401,
                    headers: {
                        "Content-Type": "application/json; charset=utf-8",
                    },
                },
            );
        }

        // 「ん」で終わる単語の場合、ゲーム終了エラーを返す
        if (nextWord.slice(-1) === "ん") {
            isGameOver = true;
            return new Response(
                JSON.stringify({
                    "errorMessage": "「ん」で終わる単語が入力されました。しりとりは終了です。",
                    "errorCode": "10000",
                }),
                {
                    status: 401,
                    headers: {
                        "Content-Type": "application/json; charset=utf-8",
                    },
                },
            );
        }

        // 同一であれば、previousWordを更新して現在の単語を返す
        previousWord.push(nextWord);
        return new Response(previousWord.at(-1));
    }

    // POST /reset: しりとりに戻す
    if (_req.method === "POST" && pathname === "/reset") {
        previousWord = ["しりとり"];
        isGameOver = false;
        return new Response(previousWord.at(-1));    
    }

    // ./public以下のファイルを公開
    return serveDir(
        _req,
        {
            /*
            - fsRoot: 公開するフォルダを指定
            - urlRoot: フォルダを展開するURLを指定。今回はlocalhost:8000/に直に展開する
            - enableCors: CORSの設定を付加するか
            */
            fsRoot: "./public/",
            urlRoot: "",
            enableCors: true,
        },
    );
});
