function deleteUser(id) {
  if (!confirm('Delete this user?')) return;
  fetch('/admin/users/' + id + '/delete', {method: 'POST'})
    .then(function (r) { return r.json(); })
    .then(function (data) {
      if (data.success) {
        location.reload();
      } else {
        alert(data.message || 'Could not delete user.');
      }
    });
}

document.querySelectorAll('.role-select').forEach(function (sel) {
  sel.addEventListener('change', function () {
    var userId = sel.getAttribute('data-user');
    var fd = new FormData();
    fd.append('role', sel.value);
    fetch('/admin/users/' + userId + '/role', {method: 'POST', body: fd})
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (!data.success) {
          alert(data.message || 'Could not change role.');
          location.reload();
        }
      });
  });
});