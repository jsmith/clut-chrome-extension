const mru: number[] = [];
let slowSwitchOngoing = false;
let fastSwitchOngoing = false;
let intSwitchCount = 0;
let lastIntSwitchIndex = 0;

let domLoaded = false;
let quickActive = 0;
let slowActive = 0;

const prevTimestamp = 0;
const slowtimerValue = 1500;
const fasttimerValue = 200;
let timer: number | undefined;

let slowswitchForward = false;
let initialized = false;
const loggingOn = false;

const CLUTlog = function (str: string) {
  if (loggingOn) {
    console.log(str);
  }
};

function onInstall() {
  CLUTlog("Extension Installed");
  chrome.windows.create({
    url: "http://www.harshay-buradkar.com/clut_update6.html",
  });
}

function onUpdate() {
  CLUTlog("Extension Updated");
  chrome.windows.create({
    url: "http://www.harshay-buradkar.com/clut_update6.html",
  });
}

function getVersion() {
  const details = chrome.runtime.getManifest();
  return details.version;
}

// Check if the version has changed.
const currVersion = getVersion();
const prevVersion = localStorage["version"];
CLUTlog("prev version: " + prevVersion);
CLUTlog("curr version: " + currVersion);

if (currVersion != prevVersion) {
  // Check if we just installed this extension.
  if (typeof prevVersion == "undefined") {
    onInstall();
  } else {
    onUpdate();
  }
  localStorage["version"] = currVersion;
}

const processCommand = function (command: string) {
  CLUTlog("Command recd:" + command);
  let fastswitch = true;
  slowswitchForward = false;
  if (command == "alt_switch_fast") {
    fastswitch = true;
    quickSwitchActiveUsage();
  } else if (command == "alt_switch_slow_backward") {
    fastswitch = false;
    slowswitchForward = false;
    slowSwitchActiveUsage();
  } else if (command == "alt_switch_slow_forward") {
    fastswitch = false;
    slowswitchForward = true;
    slowSwitchActiveUsage();
  }

  if (!slowSwitchOngoing && !fastSwitchOngoing) {
    if (fastswitch) {
      fastSwitchOngoing = true;
    } else {
      slowSwitchOngoing = true;
    }
    CLUTlog("CLUT::START_SWITCH");
    intSwitchCount = 0;
    doIntSwitch();
  } else if (
    (slowSwitchOngoing && !fastswitch) ||
    (fastSwitchOngoing && fastswitch)
  ) {
    CLUTlog("CLUT::DO_INT_SWITCH");
    doIntSwitch();
  } else if (slowSwitchOngoing && fastswitch) {
    endSwitch();
    fastSwitchOngoing = true;
    CLUTlog("CLUT::START_SWITCH");
    intSwitchCount = 0;
    doIntSwitch();
  } else if (fastSwitchOngoing && !fastswitch) {
    endSwitch();
    slowSwitchOngoing = true;
    CLUTlog("CLUT::START_SWITCH");
    intSwitchCount = 0;
    doIntSwitch();
  }

  if (timer) {
    if (fastSwitchOngoing || slowSwitchOngoing) {
      clearTimeout(timer);
    }
  }
  if (fastswitch) {
    timer = setTimeout(function () {
      endSwitch();
    }, fasttimerValue);
  } else {
    timer = setTimeout(function () {
      endSwitch();
    }, slowtimerValue);
  }
};

chrome.commands.onCommand.addListener(processCommand);

chrome.browserAction.onClicked.addListener(function (tab) {
  CLUTlog("Click recd");
  processCommand("alt_switch_fast");
});

chrome.runtime.onStartup.addListener(function () {
  CLUTlog("on startup");
  initialize();
});

chrome.runtime.onInstalled.addListener(function () {
  CLUTlog("on startup");
  initialize();
});

const doIntSwitch = function () {
  CLUTlog(
    "CLUT:: in int switch, intSwitchCount: " +
      intSwitchCount +
      ", mru.length: " +
      mru.length
  );
  if (intSwitchCount < mru.length && intSwitchCount >= 0) {
    let tabIdToMakeActive: number;
    //check if tab is still present
    //sometimes tabs have gone missing
    let invalidTab = true;
    let thisWindowId: number;
    if (slowswitchForward) {
      decrementSwitchCounter();
    } else {
      incrementSwitchCounter();
    }
    tabIdToMakeActive = mru[intSwitchCount];
    chrome.tabs.get(tabIdToMakeActive, function (tab) {
      if (tab) {
        thisWindowId = tab.windowId;
        invalidTab = false;

        chrome.windows.update(thisWindowId, { focused: true });
        chrome.tabs.update(tabIdToMakeActive, {
          active: true,
          highlighted: true,
        });
        lastIntSwitchIndex = intSwitchCount;
        //break;
      } else {
        CLUTlog(
          "CLUT:: in int switch, >>invalid tab found.intSwitchCount: " +
            intSwitchCount +
            ", mru.length: " +
            mru.length
        );
        removeItemAtIndexFromMRU(intSwitchCount);
        if (intSwitchCount >= mru.length) {
          intSwitchCount = 0;
        }
        doIntSwitch();
      }
    });
  }
};

const endSwitch = function () {
  CLUTlog("CLUT::END_SWITCH");
  slowSwitchOngoing = false;
  fastSwitchOngoing = false;
  const tabId = mru[lastIntSwitchIndex];
  putExistingTabToTop(tabId);
  printMRUSimple();
};

chrome.tabs.onActivated.addListener(function (activeInfo) {
  if (!slowSwitchOngoing && !fastSwitchOngoing) {
    const index = mru.indexOf(activeInfo.tabId);

    //probably should not happen since tab created gets called first than activated for new tabs,
    // but added as a backup behavior to avoid orphan tabs
    if (index == -1) {
      CLUTlog("Unexpected scenario hit with tab(" + activeInfo.tabId + ").");
      addTabToMRUAtFront(activeInfo.tabId);
    } else {
      putExistingTabToTop(activeInfo.tabId);
    }
  }
});

chrome.tabs.onCreated.addListener(function (tab) {
  if (tab.id == null) return;
  CLUTlog("Tab create event fired with tab(" + tab.id + ")");
  addTabToMRUAtBack(tab.id);
});

chrome.tabs.onRemoved.addListener(function (tabId, removedInfo) {
  CLUTlog("Tab remove event fired from tab(" + tabId + ")");
  removeTabFromMRU(tabId);
});

const addTabToMRUAtBack = function (tabId: number) {
  const index = mru.indexOf(tabId);
  if (index == -1) {
    //add to the end of mru
    mru.splice(-1, 0, tabId);
  }
};

const addTabToMRUAtFront = function (tabId: number) {
  const index = mru.indexOf(tabId);
  if (index == -1) {
    //add to the front of mru
    mru.splice(0, 0, tabId);
  }
};
const putExistingTabToTop = function (tabId: number) {
  const index = mru.indexOf(tabId);
  if (index != -1) {
    mru.splice(index, 1);
    mru.unshift(tabId);
  }
};

const removeTabFromMRU = function (tabId: number) {
  const index = mru.indexOf(tabId);
  if (index != -1) {
    mru.splice(index, 1);
  }
};

const removeItemAtIndexFromMRU = function (index: number) {
  if (index < mru.length) {
    mru.splice(index, 1);
  }
};

const incrementSwitchCounter = function () {
  intSwitchCount = (intSwitchCount + 1) % mru.length;
};

const decrementSwitchCounter = function () {
  if (intSwitchCount == 0) {
    intSwitchCount = mru.length - 1;
  } else {
    intSwitchCount = intSwitchCount - 1;
  }
};

const initialize = function () {
  if (!initialized) {
    initialized = true;
    chrome.windows.getAll({ populate: true }, function (windows) {
      windows.forEach(function (window) {
        window.tabs?.forEach(function (tab) {
          if (tab.id == null) return;
          mru.unshift(tab.id);
        });
      });
      CLUTlog("MRU after init: " + mru);
    });
  }
};

const printMRUSimple = function () {
  CLUTlog("mru: " + mru);
};

initialize();

const quickSwitchActiveUsage = function () {
  if (domLoaded) {
    if (quickActive == -1) {
      return;
    } else if (quickActive < 5) {
      quickActive++;
    } else if (quickActive >= 5) {
      quickActive = -1;
    }
  }
};

const slowSwitchActiveUsage = function () {
  if (domLoaded) {
    if (slowActive == -1) {
      return;
    } else if (slowActive < 5) {
      slowActive++;
    } else if (slowActive >= 5) {
      slowActive = -1;
    }
  }
};

document.addEventListener("DOMContentLoaded", function () {
  domLoaded = true;
});
