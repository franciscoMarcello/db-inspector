import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { MatCardModule } from '@angular/material/card';
import { MatInputModule } from '@angular/material/input';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatIconButton } from '@angular/material/button';
import { AuthService } from '../../services/auth.service';
import { AppButtonComponent } from '../shared/app-button/app-button.component';

@Component({
  selector: 'app-password-reset',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    RouterModule,
    MatCardModule,
    MatInputModule,
    MatFormFieldModule,
    MatIconModule,
    MatIconButton,
    AppButtonComponent,
  ],
  templateUrl: './password-reset.component.html',
  styleUrls: ['./password-reset.component.css'],
})
export class PasswordResetComponent implements OnInit {
  private auth = inject(AuthService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);

  token = '';
  email = '';
  newPassword = '';
  passwordVisible = false;
  loading = false;
  error = '';
  success = '';

  get isConfirmMode(): boolean {
    return !!this.token;
  }

  ngOnInit(): void {
    this.token = String(this.route.snapshot.queryParamMap.get('token') || '').trim();
  }

  submitRequest(): void {
    this.error = '';
    const email = this.email.trim();
    if (!email) {
      this.error = 'Informe seu e-mail.';
      return;
    }

    this.loading = true;
    this.auth.requestPasswordReset(email).subscribe({
      next: () => {
        this.loading = false;
        this.success = 'Se o e-mail estiver cadastrado, você receberá as instruções em breve.';
      },
      error: (err: HttpErrorResponse) => {
        this.loading = false;
        if (err?.status === 429) {
          this.error = 'Muitas tentativas. Tente novamente em instantes.';
          return;
        }
        this.error = 'Não foi possível processar a solicitação. Tente novamente.';
      },
    });
  }

  submitConfirm(): void {
    this.error = '';
    const password = this.newPassword;
    if (!password) {
      this.error = 'Informe a nova senha.';
      return;
    }

    this.loading = true;
    this.auth.confirmPasswordReset(this.token, password).subscribe({
      next: () => {
        this.loading = false;
        this.success = 'Senha redefinida com sucesso. Você já pode fazer login.';
      },
      error: (err: HttpErrorResponse) => {
        this.loading = false;
        if (err?.status === 400) {
          this.error = 'Token inválido ou expirado. Solicite um novo link de redefinição.';
          return;
        }
        if (err?.status === 422) {
          const msg = (err.error as any)?.message;
          this.error = msg || 'A senha não atende aos requisitos de segurança.';
          return;
        }
        this.error = 'Não foi possível redefinir a senha. Tente novamente.';
      },
    });
  }

  goToLogin(): void {
    this.router.navigate(['/login']);
  }
}
