package update

import "errors"

// ErrUnsupported is returned when the platform does not support in-app
// self-update. The frontend should hide the "Update" button on such
// platforms and surface the release URL instead.
var ErrUnsupported = errors.New("update: in-app install is not supported on this platform")
