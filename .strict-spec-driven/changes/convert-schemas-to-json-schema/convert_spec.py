#!/usr/bin/env python3
"""Convert spec YAML files from old array-based format to new compact format."""

import yaml
import sys
from pathlib import Path


def convert_steps(steps):
    """Convert steps from {kind, text} objects to {KIND: text} objects."""
    converted = []
    for step in steps:
        kind = step['kind']
        text = step['text']
        # Use single-key format
        converted.append({kind: text})
    return converted


def convert_scenarios(scenarios):
    """Convert scenarios from array-with-id to mapping-with-id-as-key."""
    converted = {}
    for scenario in scenarios:
        scenario_id = scenario['id']
        # Convert steps
        steps = convert_steps(scenario['steps'])
        converted[scenario_id] = steps
    return converted


def convert_requirements(requirements):
    """Convert requirements from array-with-id to mapping-with-id-as-key."""
    converted = {}
    for req in requirements:
        req_id = req['id']
        # Convert scenarios
        scenarios = convert_scenarios(req['scenarios'])
        # Build converted requirement
        converted[req_id] = {
            'strength': req['strength'],
            'statement': req['statement'],
            'scenarios': scenarios
        }
    return converted


def convert_spec_file(input_path, output_path):
    """Convert a spec file from old to new format."""
    with open(input_path, 'r') as f:
        data = yaml.safe_load(f)

    # Only convert the requirements section
    if 'requirements' in data:
        data['requirements'] = convert_requirements(data['requirements'])

    # Write output with proper formatting
    with open(output_path, 'w') as f:
        yaml.dump(data, f, default_flow_style=False, sort_keys=False, width=1000, allow_unicode=True)


if __name__ == '__main__':
    if len(sys.argv) != 3:
        print(f"Usage: {sys.argv[0]} <input.yaml> <output.yaml>")
        sys.exit(1)

    input_path = Path(sys.argv[1])
    output_path = Path(sys.argv[2])

    if not input_path.exists():
        print(f"Error: Input file {input_path} does not exist")
        sys.exit(1)

    convert_spec_file(input_path, output_path)
    print(f"Converted {input_path} -> {output_path}")
