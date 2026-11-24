// action.onClicked (rather than openPanelOnActionClick) is what grants activeTab.
chrome.action.onClicked.addListener((tab) => chrome.sidePanel.open({ tabId: tab.id }));
