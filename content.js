const TOOLS_PANEL_ID = 'kt-tools-panel';
const CLONE_BUTTON_ID = 'kt-clone-button';
const TICKET_PAGE_PATTERN = /^\/main\/ticket\/\d+/;
const SUBMITTED_STORAGE_KEY = 'kt-submited-tickets'
const SUCCESS_BUTTON_TEXT = 'Скопіювано'
const BACKEND_SERVER = 'https://1551-back.kyivcity.gov.ua';

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function sendMessagePromise(item) {
    return new Promise((resolve, reject) => {
        chrome.runtime.sendMessage(item, response => {
            if (response.ok) {
                resolve(response.data);
            } else {
                reject('Something wrong');
            }
        });
    });
}

function fromBase64String(value) {
    return Uint8Array.from(atob(value), c => c.charCodeAt(0))
}

async function waitTicketContainer() {
    while (true) {
        console.log('Wait for ticket container...');
        const containers = document.getElementsByClassName('main-content');
        if (containers.length !== 0) {
            console.log('Ticket cotainer found');
            return containers[0];
        }
        await sleep(100);
    }
}

async function watchToolsPanel() {
    console.log('Watch tools panel');
    while (true) {
        const tool = document.getElementById(TOOLS_PANEL_ID);
        if (!tool) {
            console.log('Tools panel not exists');
            return;
        }
        await sleep(100);
    }
}

async function waitTicketURL() {
    console.log('Wait ticket URL');
    while (true) {
        if (location.pathname.match(TICKET_PAGE_PATTERN)) {
            console.log('Ticket URL detected')
            return;
        }
        await sleep(100);
    }
}


function getTicketNumber() {
    return location.pathname.match(/\d+/)[0];
}


function getClonedTickets() {
    const item = localStorage.getItem(SUBMITTED_STORAGE_KEY);
    if (!item) {
        return [];
    }
    try {
        return JSON.parse(item);
    } catch (e) {
        return [];
    }
}


function getToken() {
    return localStorage.getItem('token');
}


function isTicketCloned(number) {
    const numbers = getClonedTickets();
    return numbers.includes(number);
}

function createButtonPanel() {
    const panel = document.createElement('div');
    panel.className = 'kt-panel';
    panel.id = TOOLS_PANEL_ID;
    return panel;
}

function getAuthRequestOptions() {
    const token = getToken();
    return {
        headers: {
            'Authorization': `Bearer ${token}`,
            'Accept': 'application/json',
            'Referer': 'https://1551.gov.ua/main/create',
            'DNT': 1,
        },
        redirect: 'error',
    }
}

async function fetchTicket(number) {
    const response = await fetch(`${BACKEND_SERVER}/api/tickets/${number}?include[]=files`);
    return await response.json();
}

async function fetchStreetId(street) {
    const url = new URL(`${BACKEND_SERVER}/api/addresses/street`);
    url.search = new URLSearchParams({ name: street }).toString();

    const response = await fetch(url, { ...getAuthRequestOptions() });
    if (!response.ok) {
        throw await response.json();
    }
    const { streets } = await response.json();
    if (streets.length === 0) {
        throw { 'street': street, 'message': 'Street not found' };
    }
    return streets[0].id;
}

async function fetchBuilding(streetId, number) {
    const url = new URL(`${BACKEND_SERVER}/api/addresses/building`);
    url.search = new URLSearchParams({ street_id: streetId, number: number }).toString();

    const response = await fetch(url, { ...getAuthRequestOptions() });
    if (!response.ok) {
        throw await response.json();
    }
    const { buildings } = await response.json();
    if (buildings.length === 0) {
        throw { 'streetId': streetId, 'number': number, 'message': 'Building not found' };
    }
    return [buildings[0].district_id, buildings[0].object_id];
}

function splitTicketAddress(address) {
    const parts = address.split(/,(?=(?:[^\)]*\)[^\)]*\))*[^\)]*$)/);
    return [parts[0].trim(), parts.slice(1).join(',').trim()];
}

async function createTicket(number) {

    const { ticket } = await fetchTicket(number);
    const formData = new FormData();

    if (ticket.files) {
        for (const file of ticket.files) {
            const filename = file.url.match(/\w+\.\w+$/)[0];
            const content = await sendMessagePromise({ query: "fetchFile", url: file.url });
            const arrayBuffer = fromBase64String(content.content);
            const blob = new Blob([arrayBuffer], { type: content.type });
            formData.append('images[]', blob, filename);
        }
    }
    chrome.runtime.sendMessage({ content: "message from the content script" });

    formData.append('subject_id', ticket.subject.id);
    formData.append('description', ticket.description);
    if (ticket.address) {
        const [street, building] = splitTicketAddress(ticket.address);
        const streetId = await fetchStreetId(street);
        const [districtId, objectId] = await fetchBuilding(streetId, building);
        formData.append('street', street);
        formData.append('building', building);
        formData.append('district_id', districtId);
        formData.append('object_id', objectId);
    }
    if (ticket.location_lat) {
        formData.append('location_lat', ticket.location_lat);
        formData.append('location_lng', ticket.location_lng);
    }
    formData.append('private', '0');
    console.log(formData);
    await sleep(5000);
    return;
    const response = await fetch(`${BACKEND_SERVER}/api/tickets`, {
        method: 'POST',
        body: formData,
        ...getAuthRequestOptions(),
    });
    if (!response.ok) {
        throw response.status;
    }
    return await response.json();
}


async function handleCloneButtonClick(evt) {
    const button = evt.target;
    button.setLoadingState();
    try {
        const number = getTicketNumber();
        await createTicket(number);

        // const tickets = getClonedTickets();
        // const storageItem = JSON.stringify([...tickets, number]);
        // localStorage.setItem(SUBMITTED_STORAGE_KEY, storageItem);

        button.setCopiedState();
    } catch (e) {
        alert(e);
        button.setCopyState();
    }
}

function createCloneButton(ticketNumber) {
    const button = document.createElement('button');
    button.id = CLONE_BUTTON_ID;

    button.setCopyState = function() {
        button.innerText = 'Скопіювати'
        button.className = 'kt-button';
        button.onclick = handleCloneButtonClick;
    }
    button.setLoadingState = function() {
        button.innerText = 'Копіювання...'
        button.className = 'kt-button kt-button-loading';
        button.onclick = undefined;
    }
    button.setCopiedState = function() {
        button.innerText = SUCCESS_BUTTON_TEXT
        button.className = 'kt-button kt-button-success';
        button.onclick = undefined;
    }

    if (isTicketCloned(ticketNumber)) {
        button.setCopiedState();
    } else {
        button.setCopyState();
    }
    return button;
}

async function demo() {
    const container = await waitTicketContainer();
    const panel = createButtonPanel();
    container.prepend(panel);

    const ticketNumber = getTicketNumber();
    const cloneButton = createCloneButton(ticketNumber)
    panel.appendChild(cloneButton);
}


async function init() {
    if (!getToken()) {
        console.log('Token not found');
        return
    };
    while (true) {
        await waitTicketURL();
        await demo();
        await watchToolsPanel();
    }
}

init()