const toBase64String = blob => btoa(new Uint8Array(blob).reduce((data, byte) => data + String.fromCharCode(byte), ''));;


chrome.runtime.onMessage.addListener(
    function (request, sender, sendResponse) {
        if (request.query == "fetchFile") {
            fetch(request.url)
                .then(response => {
                    debugger;
                    const blob = response.blob();
                    return blob;
                })
                .then(blob => blob
                    .arrayBuffer()
                    .then(content => {
                        return sendResponse({
                            ok: true, data: { content: toBase64String(content), type: blob.type }
                        });
                    })
                )
            return true;  // Will respond asynchronously.
        }
    });