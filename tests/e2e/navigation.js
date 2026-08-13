document.getElementById('navigate-sensitive').addEventListener('click', () => {
    history.pushState({}, '', '/messages/');
});

document.getElementById('navigate-safe').addEventListener('click', () => {
    history.pushState({}, '', '/fixture.html');
});
