(function registerTrainingRevisions(root) {
 'use strict';

 const dateLabel = date => /^\d{4}-\d{2}-\d{2}$/.test(date) ? date.split('-').reverse().join('/') : date;

 function snapshot(value) {
  return JSON.stringify(value, (key, item) => item && typeof item === 'object' && !Array.isArray(item)
   ? Object.fromEntries(Object.keys(item).sort().map(name => [name, item[name]])) : item);
 }

 function mount(host, { sport, request, onApplied }) {
  const cycling = sport === 'Cycling';
  const make = (tag, text, className) => {
   const node = document.createElement(tag);
   if (text) node.textContent = text;
   if (className) node.className = className;
   return node;
  };
  const section = make('section', '', 'mile35-panel m881-revision');
  const review = make('button', 'Review recovery adjustment', 'btn alt sm');
  const content = make('div');
  const status = make('p', '', 'muted small');
  review.type = 'button';
  status.setAttribute('role', 'status');
  section.append(make('h3', 'MILE Intelligence · Workout adjustment'), review, status, content);
  host.append(section);
  const history = cycling ? make('details', '', 'mile35-panel m881-detailed') : null;
  const historyBody = cycling ? make('div') : null;
  async function loadHistory() {
   historyBody.replaceChildren(make('p', 'Loading approved revisions…', 'muted small'));
   try {
    const entries = await request('mile_cycling_revision_history', {});
    historyBody.replaceChildren();
    if (!entries.length) historyBody.append(make('p', 'No cycling revisions approved yet.', 'muted small'));
    for (const {before, after} of entries) {
     historyBody.append(make('p', dateLabel(before.date) + ' · ' + before.name + ' (' +
      before.plannedMinutes + ' min) → ' + after.name + ' (' + after.plannedMinutes + ' min)', 'small'));
    }
   } catch (error) {
    historyBody.replaceChildren(make('p', error.message, 'small'));
   }
  }
  if (history) {
   history.append(make('summary', 'Approved cycling revisions'), historyBody);
   history.addEventListener('toggle', () => { if (history.open) loadHistory(); });
   host.append(history);
  }

  review.addEventListener('click', async () => {
   review.disabled = true;
   content.replaceChildren();
   status.textContent = 'Checking saved training evidence…';
   try {
    const proposal = await request('mile_review_training_revision', { p_sport: sport });
    if (proposal.status !== 'review') {
     status.textContent = proposal.status === 'already-applied'
      ? 'A revision was already approved for this check-in or workout.'
      : 'The saved evidence and plan do not support an eligible revision.';
     return;
    }

    if (!cycling) root.mileRunningBeta?.mark('proposal-reviewed');
    const { before, after, evidence } = proposal;
    const heading = make('h4', before.name + ' · ' + (cycling ? dateLabel(before.date) : before.date));
    const button = make('button', 'Approve this revision', 'btn sm');
    button.type = 'button';
    status.textContent = '';
    const comparison = make('div', '', 'm881-revision-preview');
    for (const [label, workout] of [['Current', before], ['Proposed', after]]) {
     const card = make('div');
     card.append(make('span', label, 'muted small'),
      make('strong', cycling ? workout.plannedMinutes + ' min' : workout.km + ' km'),
      make('span', cycling ? workout.name : '~' + workout.plannedMinutes + ' min'));
     comparison.append(card);
    }
    const evidenceText = cycling
     ? 'High fatigue in your two latest check-ins. ' +
       evidence.checkins.map(checkin => checkin.fatigue + '/10 on ' + dateLabel(checkin.date)).join(' · ')
     : evidence.fatigue + '/10 fatigue in your ' + evidence.date + ' check-in.';
    const change = cycling ? 'Easy spin at 1–2/10 effort. This changes one Calendar ride only.' : 'Shorter run at the same targets.';
    content.append(heading, make('p', evidenceText, 'muted small'), comparison, make('p', change, 'muted small'), button);
    let cancel;
    if (cycling) {
     cancel = make('button', 'Keep current ride', 'btn alt sm');
     const actions = make('div', '', 'row');
     cancel.type = 'button';
     actions.append(button, cancel);
     content.append(actions);
     cancel.addEventListener('click', () => {
      content.replaceChildren();
      status.textContent = 'The current ride was kept.';
      review.focus();
     });
    }

    button.addEventListener('click', async () => {
     button.disabled = true;
     review.disabled = true;
     if (cancel) cancel.disabled = true;
     status.textContent = 'Saving the reviewed revision…';
     try {
      const receipt = await request('mile_approve_training_revision', {
       p_proposal_id: proposal.id, p_approved: true
      });
      if (!['applied', 'duplicate'].includes(receipt.status)) throw Error('Revision result unavailable.');
      if (!cycling) root.mileRunningBeta?.mark('proposal-approved');
      if (history?.open) loadHistory();
      const updated = cycling && onApplied?.(receipt, proposal);
      status.textContent = updated ? 'Revision saved to Calendar.' : 'Revision saved. Reload your plan before making Calendar edits.';
      content.replaceChildren();
     } catch (error) {
      status.textContent = error.message;
      button.disabled = error.status === 409;
     } finally {
      review.disabled = false;
      if (cancel) cancel.disabled = false;
     }
    });
   } catch (error) {
    status.textContent = error.message;
   } finally {
    review.disabled = false;
   }
  });
 }

 root.mileTrainingRevisions = { mount, snapshot };
})(globalThis);
