import type { Controller } from '../app/controller';
import { pname } from './common';
import { PersonView } from './views/person';
import { TeamView } from './views/team';
import { SeasonView, SeasonHome } from './views/season';
import { HistoryHome, LayoutView, CompareView } from './views/history';
import { StoriesHome, StoryView } from './views/stories';
import { PeopleHome } from './views/people';
import { RaceView } from './views/race';

export function Panels({ c }: { c: Controller }) {
  const u = c.u!;
  const v = c.views[c.views.length - 1];
  const title = !v ? { season: 'Season', people: 'People', history: 'History', stories: 'Stories', live: 'Live' }[c.dest]
    : v.kind === 'person' ? pname(u, v.id) : v.kind === 'team' ? u.teams[v.id]?.name : v.kind === 'race' ? `${u.races[v.id]?.name} ${u.races[v.id]?.year}` : v.kind === 'season' ? `${v.year} season` : v.kind === 'layout' ? 'Circuit' : v.kind === 'story' ? 'Story' : 'Head to head';
  return (
    <aside class="sheet" aria-label={title}>
      <div class="sheet-head">
        {v && <button class="btn ghost" onClick={() => c.back()} aria-label="Back">←</button>}
        <h2>{title}</h2>
        <button class="btn" onClick={() => c.go('live')}>Close</button>
      </div>
      <div class="sheet-body">
        {!v ? (c.dest === 'season' ? <SeasonHome c={c} /> : c.dest === 'people' ? <PeopleHome c={c} /> : c.dest === 'history' ? <HistoryHome c={c} /> : <StoriesHome c={c} />)
          : v.kind === 'person' ? <PersonView c={c} id={v.id} asOf={v.asOf} />
          : v.kind === 'team' ? <TeamView c={c} id={v.id} asOf={v.asOf} />
          : v.kind === 'race' ? <RaceView c={c} id={v.id} />
          : v.kind === 'season' ? <SeasonView c={c} year={v.year} />
          : v.kind === 'layout' ? <LayoutView c={c} id={v.id} />
          : v.kind === 'story' ? <StoryView c={c} id={v.id} />
          : <CompareView c={c} a={v.a} b={v.b} />}
      </div>
    </aside>
  );
}
