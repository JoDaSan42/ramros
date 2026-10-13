import {
  shellSingleQuote,
  shellDoubleQuote,
  buildTopicPubCommand,
  buildServiceCallCommand
} from '../../core/command-builders';

describe('command-builders', () => {
  describe('shellSingleQuote', () => {
    it('wraps a plain string in single quotes', () => {
      expect(shellSingleQuote('hello')).toBe("'hello'");
    });

    it("escapes embedded single quotes POSIX-style", () => {
      expect(shellSingleQuote("it's")).toBe("'it'\\''s'");
    });

    it('escapes every embedded single quote', () => {
      expect(shellSingleQuote("a'b'c")).toBe("'a'\\''b'\\''c'");
    });
  });

  describe('shellDoubleQuote', () => {
    it('wraps a plain string in double quotes', () => {
      expect(shellDoubleQuote('hello')).toBe('"hello"');
    });

    it('escapes double quotes, dollars, backslashes and backticks', () => {
      expect(shellDoubleQuote('a"b$c')).toBe('"a\\"b\\$c"');
      expect(shellDoubleQuote('a\\b')).toBe('"a\\\\b"');
      expect(shellDoubleQuote('a`b')).toBe('"a\\`b"');
    });

    it('leaves other characters untouched', () => {
      expect(shellDoubleQuote("plain; rm -rf /")).toBe('"plain; rm -rf /"');
    });
  });

  describe('buildTopicPubCommand', () => {
    it('builds a once-mode publish command', () => {
      expect(
        buildTopicPubCommand('/topic', 'std_msgs/msg/String', '{data: 1}', 'once')
      ).toBe("ros2 topic pub \"/topic\" \"std_msgs/msg/String\" '{data: 1}' --once");
    });

    it('builds a rate-mode publish command', () => {
      expect(
        buildTopicPubCommand('/topic', 'std_msgs/msg/String', '{data: 1}', 'rate', 10)
      ).toBe("ros2 topic pub \"/topic\" \"std_msgs/msg/String\" '{data: 1}' --rate 10");
    });

    it('shell-quotes arguments containing metacharacters', () => {
      expect(
        buildTopicPubCommand('/to"pic', 'std_msgs/msg/String', "{data: 'x'}", 'once')
      ).toBe(
        'ros2 topic pub "/to\\"pic" "std_msgs/msg/String" \'{data: \'\\\'\'x\'\\\'\'}\' --once'
      );
    });
  });

  describe('buildServiceCallCommand', () => {
    it('builds a service call command with double-quoted endpoints and single-quoted json', () => {
      expect(
        buildServiceCallCommand('/reset', 'std_srvs/srv/Trigger', '{"a": "x"}')
      ).toBe('ros2 service call "/reset" "std_srvs/srv/Trigger" \'{"a": "x"}\'');
    });

    it("escapes single quotes inside json so it survives POSIX sh", () => {
      expect(
        buildServiceCallCommand('/reset', 'std_srvs/srv/Trigger', '{"a": "x\'y"}')
      ).toBe(
        'ros2 service call "/reset" "std_srvs/srv/Trigger" \'{"a": "x\'\\\'\'y"}\''
      );
    });
  });
});
