#!/usr/bin/env python3
"""Validate the planning snapshot or print a launch prompt; no remote writes."""
import argparse
import copy
import json
from pathlib import Path

BASE = Path(__file__).resolve().parent
ROOT = BASE.parent.parent


def errors(data):
    found = []
    tasks = data.get('tasks', [])
    ids = [t['id'] for t in tasks]
    if len(ids) != len(set(ids)):
        found.append('Duplicate task key')
    by_id = {t['id']: t for t in tasks}
    numbers = [t.get('issue') for t in tasks if t.get('issue')]
    if len(numbers) != len(set(numbers)):
        found.append('Duplicate leaf issue number')
    profiles = json.loads((BASE / 'verification.json').read_text())
    for t in tasks:
        for field in ('summary', 'user_outcome', 'requirements', 'source_paths',
                      'target_paths', 'steps', 'acceptance', 'deletion',
                      'non_goals', 'conflict_groups', 'verification_profiles',
                      'test_scenarios', 'completion_evidence'):
            if not t.get(field):
                found.append(f"{t['id']}: missing {field}")
        for dep in t.get('dependencies', []):
            if dep not in by_id:
                found.append(f"{t['id']}: unknown dependency {dep}")
        if any(p not in profiles for p in t.get('verification_profiles', [])):
            found.append(f"{t['id']}: unknown verification profile")
        if not (BASE / 'issues' / (t['id'] + '.md')).is_file():
            found.append(f"{t['id']}: missing rendered local plan")
        if not t.get('parent_issues'):
            found.append(f"{t['id']}: no parent owner")
        for row in t.get('acceptance', []):
            if not all(row.get(k) for k in ('id', 'given', 'when', 'then', 'proof')):
                found.append(f"{t['id']}: incomplete acceptance row")
    done, active = set(), set()

    def walk(key):
        if key in active:
            found.append('Dependency cycle at ' + key)
            return
        if key in done or key not in by_id:
            return
        active.add(key)
        for dep in by_id[key].get('dependencies', []):
            walk(dep)
        active.remove(key)
        done.add(key)

    for key in by_id:
        walk(key)
    for parent in data.get('parents', []):
        if not any(parent['number'] in t['parent_issues'] for t in tasks):
            found.append(f"Parent {parent['number']}: no executable owner")
    coverage = data.get('td_coverage', {})
    if set(coverage) != {f'TD-{i:02d}' for i in range(40)}:
        found.append('TD coverage must contain all forty work items')
    for key, owner in coverage.items():
        if owner not in by_id:
            found.append(f'{key}: unknown primary owner {owner}')
    return found


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('command', choices=['validate', 'list', 'launch'])
    parser.add_argument('key', nargs='?')
    parser.add_argument('--self-test', action='store_true')
    args = parser.parse_args()
    data = json.loads((BASE / 'queue.json').read_text())
    found = errors(data)
    if found:
        raise SystemExit('\n'.join(found))
    if args.self_test:
        for mutation in ('duplicate', 'dependency', 'cycle', 'coverage', 'acceptance'):
            bad = copy.deepcopy(data)
            if mutation == 'duplicate':
                bad['tasks'].append(copy.deepcopy(bad['tasks'][0]))
            elif mutation == 'dependency':
                bad['tasks'][0]['dependencies'].append('DOES-NOT-EXIST')
            elif mutation == 'cycle':
                bad['tasks'][0]['dependencies'].append(bad['tasks'][0]['id'])
            elif mutation == 'coverage':
                bad['td_coverage'].pop('TD-00')
            else:
                bad['tasks'][0]['acceptance'][0].pop('proof')
            if not errors(bad):
                raise SystemExit('Negative fixture escaped: ' + mutation)
        print('Five negative planning fixtures: PASS')
    if args.command == 'validate':
        print(f"Planning validation: PASS ({len(data['tasks'])} leaves, {len(data['parents'])} parents, forty TD owners)")
    elif args.command == 'list':
        for t in data['tasks']:
            print(t['id'], '#' + str(t.get('issue') or 'DRAFT'),
                  'depends=' + ','.join(t['dependencies']),
                  'conflicts=' + ','.join(t['conflict_groups']))
    else:
        task = next((t for t in data['tasks'] if t['id'] == args.key), None)
        if task is None:
            raise SystemExit('Unknown key; use list')
        print(f"Implement {task['id']} / #{task.get('issue') or 'DRAFT'} end to end in one reviewable PR.\n"
              f"Read AGENTS.md, planning/AGENTS.md and planning/implementation/issues/{task['id']}.md.\n"
              'Verify fresh main, merged prerequisite outcomes and active PR/conflict claims. '
              'Follow all acceptance/deletion requirements, run applicable local gates, '
              'record issue-specific evidence, and append your PR/status note to roadmap #134. '
              'Do not close the parent, overwrite global planning state, merge or deploy by assumption.')


if __name__ == '__main__':
    main()
