package cli

import "fmt"

// FormatMebibytes renders a byte count the way the CLI accepts it back, e.g.
// 2147483648 -> "2048m". Empty when there is nothing to report.
func FormatMebibytes(bytes int64) string {
	if bytes <= 0 {
		return ""
	}

	return fmt.Sprintf("%dm", bytes/(1024*1024))
}

// OrEmpty keeps JSON arrays as [] rather than null, so clients never have to
// guard against a missing list.
func OrEmpty(values []string) []string {
	if values == nil {
		return []string{}
	}

	return values
}
