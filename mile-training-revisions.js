(function registerTrainingRevisions(root) {
 'use strict';

 function mount(host, { sport, request }) {
  const make = (tag, text, className) => {
   const node = document.createElement(tag);
   if (text) node.textContent = text;
   if (className) node.className = className;
   return node;
  };
  const section = make('section', '', 'mile35-panel');
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
    content.append(
     heading,
     make('p', 'Saved recovery check-in for ' + evidence.date + ' · ' + evidence.fatigue + '/10 self-reported fatigue.'),
     make('p', 'Reduce the next eligible aerobic workout while retaining its prescribed effort targets.'),
     make('p', 'Current · ' + before.km + ' km · ~' + before.plannedMinutes + ' min. ' + before.detail),
     make('p', 'Proposed · ' + after.km + ' km · ~' + after.plannedMinutes + ' min. ' + after.detail),
     button
    );
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
