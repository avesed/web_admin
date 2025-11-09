'use strict';

(function () {
  const form = document.getElementById('editor-form');
  if (!form) {
    return;
  }

  const SECTION_SELECTOR = '[data-section-item]';
  const CARD_SELECTOR = '[data-card-item]';
  const SECTION_HANDLE_SELECTOR = '[data-drag-handle="section"]';
  const CARD_HANDLE_SELECTOR = '[data-drag-handle="card"]';
  const sectionList = form.querySelector('[data-sortable="sections"]');
  const sectionCountInput = form.querySelector('[data-section-count]');
  const pageSlugInput = form.querySelector('input[name="page_slug"]');
  const pageSlug = pageSlugInput?.value?.trim() || 'default';
  const scrollStorageKey = `admin-scroll-${pageSlug}`;
  let lastActionButton = null;

  const storage = {
    get(key) {
      try {
        return window.sessionStorage.getItem(key);
      } catch (_) {
        return null;
      }
    },
    set(key, value) {
      try {
        window.sessionStorage.setItem(key, value);
      } catch (_) {
        // Ignore storage unavailability (e.g., private mode).
      }
    },
    remove(key) {
      try {
        window.sessionStorage.removeItem(key);
      } catch (_) {
        // Ignore storage unavailability (e.g., private mode).
      }
    },
  };

  function restoreScrollPosition() {
    const rawValue = storage.get(scrollStorageKey);
    if (rawValue === null) return;
    const target = Number(rawValue);
    if (Number.isFinite(target)) {
      requestAnimationFrame(() => {
        window.scrollTo(0, target);
      });
    }
    storage.remove(scrollStorageKey);
  }

  function rememberScrollPosition() {
    storage.set(scrollStorageKey, String(window.scrollY || window.pageYOffset || 0));
  }

  function shouldPreserveScroll(actionValue, submitter) {
    if (submitter?.hasAttribute('data-preserve-scroll')) {
      return true;
    }
    if (typeof actionValue !== 'string') {
      return false;
    }
    return actionValue.startsWith('delete_') || actionValue.startsWith('add_');
  }

  function getSubmitter(event) {
    if (event.submitter) {
      return event.submitter;
    }
    if (lastActionButton) {
      return lastActionButton;
    }
    const active = document.activeElement;
    if (active && active.form === form) {
      return active;
    }
    return null;
  }

  function setupSortable(list, { itemSelector, handleSelector, onUpdate }) {
    if (!list) return;
    let dragItem = null;
    let dropTarget = null;

    list.querySelectorAll(itemSelector).forEach((item) => {
      let handles = handleSelector
        ? Array.from(item.querySelectorAll(handleSelector)).filter(
            (handle) => handle.closest(itemSelector) === item
          )
        : [item];
      if (!handles.length) {
        handles = [item];
      }
      handles.forEach((handle) => {
        handle.setAttribute('draggable', 'true');
        handle.addEventListener('dragstart', (event) => {
          dragItem = item;
          item.classList.add('is-dragging');
          if (event.dataTransfer) {
            event.dataTransfer.effectAllowed = 'move';
            event.dataTransfer.setData('text/plain', '');
            const rect = item.getBoundingClientRect();
            const offsetX = event.clientX - rect.left;
            const offsetY = event.clientY - rect.top;
            try {
              event.dataTransfer.setDragImage(item, offsetX, offsetY);
            } catch (_) {
              // Some browsers may throw if the drag image can't be set; ignore.
            }
          }
        });
        handle.addEventListener('dragend', () => {
          if (!dragItem) return;
          dragItem.classList.remove('is-dragging');
          dragItem = null;
          clearDropTarget();
          if (typeof onUpdate === 'function') {
            onUpdate();
          }
        });
      });
    });

    list.addEventListener('dragover', (event) => {
      if (!dragItem) return;
      event.preventDefault();
      if (event.dataTransfer) {
        event.dataTransfer.dropEffect = 'move';
      }
      const target = event.target.closest(itemSelector);
      if (target && target !== dragItem) {
        const rect = target.getBoundingClientRect();
        const insertBefore = event.clientY < rect.top + rect.height / 2;
        list.insertBefore(dragItem, insertBefore ? target : target.nextSibling);
        setDropTarget(target);
      } else if (!target) {
        const isLast = list.lastElementChild === dragItem;
        if (!isLast) {
          list.appendChild(dragItem);
        }
        clearDropTarget();
      }
    });

    list.addEventListener('drop', (event) => {
      if (dragItem) {
        event.preventDefault();
      }
    });

    function setDropTarget(target) {
      if (dropTarget === target) return;
      if (dropTarget) dropTarget.classList.remove('is-drop-target');
      dropTarget = target;
      if (dropTarget) dropTarget.classList.add('is-drop-target');
    }

    function clearDropTarget() {
      if (dropTarget) {
        dropTarget.classList.remove('is-drop-target');
        dropTarget = null;
      }
    }
  }

  function reindexSections() {
    if (!sectionList) return;
    const sections = Array.from(sectionList.querySelectorAll(SECTION_SELECTOR));
    if (sectionCountInput) {
      sectionCountInput.value = sections.length;
    }
    sections.forEach((sectionEl, index) => {
      sectionEl.dataset.sectionIndex = String(index);
      const label = sectionEl.querySelector('[data-section-label]');
      if (label) {
        label.textContent = `区块 ${index + 1}`;
      }
      sectionEl.querySelectorAll('[name^="sections-"]').forEach((field) => {
        if (!field.name) return;
        field.name = field.name.replace(/^sections-\d+/, `sections-${index}`);
      });
      sectionEl.querySelectorAll('[data-section-action]').forEach((button) => {
        const action = button.getAttribute('data-section-action');
        if (action) {
          button.value = `${action}_${index}`;
        }
      });
      reindexCards(sectionEl, index);
    });
  }

  function reindexCards(sectionEl, sectionIndex) {
    const cardList = sectionEl.querySelector('[data-sortable="cards"]');
    if (!cardList) return;
    const cards = Array.from(cardList.querySelectorAll(CARD_SELECTOR));
    const cardCountInput = sectionEl.querySelector('[data-card-count]');
    if (cardCountInput) {
      cardCountInput.value = cards.length;
      cardCountInput.name = cardCountInput.name.replace(
        /^sections-\d+/,
        `sections-${sectionIndex}`
      );
    }
    cards.forEach((cardEl, cardIndex) => {
      cardEl.dataset.cardIndex = String(cardIndex);
      const cardLabel = cardEl.querySelector('[data-card-label]');
      if (cardLabel) {
        cardLabel.textContent = `卡片 ${cardIndex + 1}`;
      }
      cardEl.querySelectorAll('[name^="sections-"]').forEach((field) => {
        if (!field.name) return;
        field.name = field.name.replace(
          /^sections-\d+-cards-\d+/,
          `sections-${sectionIndex}-cards-${cardIndex}`
        );
      });
      const deleteButton = cardEl.querySelector('[data-card-delete]');
      if (deleteButton) {
        deleteButton.value = `delete_card_${sectionIndex}_${cardIndex}`;
      }
    });
  }

  if (sectionList) {
    setupSortable(sectionList, {
      itemSelector: SECTION_SELECTOR,
      handleSelector: SECTION_HANDLE_SELECTOR,
      onUpdate: reindexSections,
    });
  }

  form.querySelectorAll('[data-sortable="cards"]').forEach((list) => {
    setupSortable(list, {
      itemSelector: CARD_SELECTOR,
      handleSelector: CARD_HANDLE_SELECTOR,
      onUpdate: reindexSections,
    });
  });

  reindexSections();
  restoreScrollPosition();
  form.addEventListener('click', (event) => {
    const button = event.target.closest('button[name="action"]');
    if (button && button.form === form) {
      lastActionButton = button;
    }
  });
  form.addEventListener('submit', (event) => {
    reindexSections();
    const submitter = getSubmitter(event);
    const actionValue = submitter?.name === 'action' ? submitter.value || '' : '';
    if (shouldPreserveScroll(actionValue, submitter)) {
      rememberScrollPosition();
    } else {
      storage.remove(scrollStorageKey);
    }
    lastActionButton = null;
  });
})();
