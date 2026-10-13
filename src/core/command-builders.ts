export function shellSingleQuote(s: string): string {
  return "'" + s.replace(/'/g, "'\\''") + "'";
}

export function shellDoubleQuote(s: string): string {
  return '"' + s.replace(/(["\\$`])/g, '\\$1') + '"';
}

export function buildTopicPubCommand(
  topic: string,
  type: string,
  content: string,
  mode: 'once' | 'rate',
  rate?: number
): string {
  const base = `ros2 topic pub ${shellDoubleQuote(topic)} ${shellDoubleQuote(type)} ${shellSingleQuote(content)}`;
  return mode === 'once' ? `${base} --once` : `${base} --rate ${rate}`;
}

export function buildServiceCallCommand(service: string, type: string, json: string): string {
  return `ros2 service call ${shellDoubleQuote(service)} ${shellDoubleQuote(type)} ${shellSingleQuote(json)}`;
}
