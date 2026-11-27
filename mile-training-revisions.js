(function registerTrainingRevisions(root) {
 'use strict';

 function mount(host, { sport, request }) {
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
  section.append(make('h3', 'Workout revision'), review, status, content);
  host.append(section);

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

    const { before, after, evidence } = proposal;
    const heading = make('h4', before.name + ' · ' + before.date);
    const button = make('button', 'Approve this revision', 'btn sm');
    button.type = 'button';
    status.textContent = '';
    const comparison = make('div', '', 'm881-revision-preview');
    for (const [label, workout] of [['Current', before], ['Proposed', after]]) {
     const card = make('div');
     card.append(make('span', label, 'muted small'), make('strong', workout.km + ' km'), make('span', '~' + workout.plannedMinutes + ' min'));
     comparison.append(card);
    }
    content.append(heading,
     make('p', evidence.fatigue + '/10 fatigue in your ' + evidence.date + ' check-in.', 'muted small'),
     comparison, make('p', 'Shorter run at the same targets.', 'muted small'), button);

    button.addEventListener('click', async () => {
     button.disabled = true;
     review.disabled = true;
     status.textContent = 'Saving the reviewed revision…';
     try {
      const receipt = await request('mile_approve_training_revision', {
       p_proposal_id: proposal.id, p_approved: true
      });
      if (!['applied', 'duplicate'].includes(receipt.status)) throw Error('Revision result unavailable.');
      status.textContent = 'Revision saved. Reload your plan before making Calendar edits.';
      content.replaceChildren();
     } catch (error) {
      status.textContent = error.message;
      button.disabled = error.status === 409;
     } finally {
      review.disabled = false;
     }
    });
   } catch (error) {
    status.textContent = error.message;
   } finally {
    review.disabled = false;
   }
  });
 }

 root.mileTrainingRevisions = { mount };
})(globalThis);
